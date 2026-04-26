// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
 ██████╗ ██╗   ██╗████████╗████████╗███████╗██████╗ ███████╗██╗  ██╗   ██╗
 ██╔══██╗██║   ██║╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗██╔════╝██║  ╚██╗ ██╔╝
 ██████╔╝██║   ██║   ██║      ██║   █████╗  ██████╔╝█████╗  ██║   ╚████╔╝
 ██╔══██╗██║   ██║   ██║      ██║   ██╔══╝  ██╔══██╗██╔══╝  ██║    ╚██╔╝
 ██████╔╝╚██████╔╝   ██║      ██║   ███████╗██║  ██║██║     ███████╗██║
 ╚═════╝  ╚═════╝    ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝

   蝴蝶预测  Butterfly Prediction  —— 三档涨跌预测协议

   ┌──────────────────────────────────────────────────────────────────┐
   │                                                                  │
   │  📐  份额制下注：1 份 = 500,000 BFLY                              │
   │  🕐  三档：20分钟 / 1小时 / 24小时（独立运行，滚动时间槽）         │
   │  🦋  押 BFLY 代币选涨跌；输不亏代币（原数返还）                    │
   │  🔒  下注代币锁仓 = 档位时长（机会成本真实）                       │
   │  💰  奖池来自代币税 BNB + 上期滚存                                 │
   │  📊  浮动赔率：早期下注权重高（基于双边对赌池比例）                │
   │  🛡️  TWAP 价格防鲸鱼操纵；单边失衡时保留暴击赔付                   │
   │  🔥  奖池分配：70% 胜方瓜分 / 20% 滚下期 / 10% 买烧代币            │
   │                                                                  │
   └──────────────────────────────────────────────────────────────────┘
*/

import {VaultBaseV2} from "./flap/VaultBaseV2.sol";
import {
    VaultUISchema,
    VaultMethodSchema,
    FieldDescriptor,
    ApproveAction
} from "./flap/IVaultSchemasV1.sol";
import {ButterflyPredictionLib} from "./ButterflyPredictionLib.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ═══════════════════════════════════════════════════════════════════════
//                          External Interfaces
// ═══════════════════════════════════════════════════════════════════════

interface IPancakePair {
    function getReserves() external view returns (uint112, uint112, uint32);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
}

interface IFlapTaxToken {
    function mainPool() external view returns (address);
    function taxRate() external view returns (uint256);
}

interface IFlapPortalQuoter {
    struct QuoteExactInputParams {
        address inputToken;
        address outputToken;
        uint256 inputAmount;
    }
    function quoteExactInput(QuoteExactInputParams calldata params) external returns (uint256);
}

interface IPancakeRouter {
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;
    function WETH() external pure returns (address);
}

// ═══════════════════════════════════════════════════════════════════════
//                       Main Contract
// ═══════════════════════════════════════════════════════════════════════

contract ButterflyPrediction is VaultBaseV2, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────── Constants ───────────────

    uint256 public constant BPS = 10_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address public constant PANCAKE_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E;

    /// @notice 时间档枚举值（同时也是数组索引）
    uint8 public constant SLOT_20MIN = 0;
    uint8 public constant SLOT_1HOUR = 1;
    uint8 public constant SLOT_24HOUR = 2;
    uint8 public constant NUM_SLOTS = 3;

    /// @notice 各档位时长（秒）
    uint256[3] public SLOT_DURATIONS = [
        uint256(20 minutes),
        1 hours,
        24 hours
    ];

    /// @notice 收盘价 TWAP 窗口（秒）—— 短档窗口短，长档窗口长
    uint256[3] public TWAP_WINDOWS = [
        uint256(2 minutes),
        5 minutes,
        30 minutes
    ];

    /// @notice 税费 BNB 入金分配到各档奖池的比例（要总和 = 9000，剩 1000 进储备）
    uint256[3] public SLOT_INFLOW_BPS = [uint256(2000), 3000, 4000];
    uint256 public constant RESERVE_INFLOW_BPS = 1000;

    /// @notice 奖池结算分配
    uint256 public constant WINNERS_BPS = 7000;   // 70% 胜方瓜分
    uint256 public constant ROLLOVER_BPS = 2000;  // 20% 滚到下一期
    uint256 public constant BURN_BPS = 1000;      // 10% 买代币烧毁

    /// @notice 份额参数
    uint256 public sharePrice = 500_000 ether;            // 默认 1 份 = 50万 BFLY
    uint256 public constant MIN_SHARE_PRICE = 100_000 ether;
    uint256 public constant MAX_SHARE_PRICE = 5_000_000 ether;
    uint16 public constant MAX_SHARES_PER_BET = 20;

    /// @notice 投注窗口在结算前多少秒关闭
    uint256[3] public BETTING_CLOSE_BEFORE = [
        uint256(2 minutes),
        5 minutes,
        1 hours
    ];

    /// @notice TWAP 累积价老化阈值
    uint32 public constant TWAP_MIN_AGE = 60;

    // ─────────────── Immutables ───────────────

    IERC20 public immutable token;
    address public immutable creator;

    // ─────────────── State ───────────────

    /// @notice 每档当前活跃轮次 ID（自增）
    uint256[3] public currentRoundId;

    struct Round {
        uint256 startTime;        // 开盘时间戳
        uint256 endTime;          // 结算时间戳
        uint256 openPrice;        // 开盘价（瞬时价，仅记录用）
        uint256 openPriceTwap;    // 开盘 TWAP 累积值
        uint32 openTwapTimestamp; // 开盘 TWAP 时间戳
        uint256 closePrice;       // 结算价 (TWAP)
        uint256 totalUpShares;    // 押涨总份数
        uint256 totalDownShares;  // 押跌总份数
        uint256 bnbPool;          // 该轮 BNB 奖池
        uint256 sharePriceLocked; // 该轮锁定的份额大小（BFLY 数量）
        bool settled;             // 是否已结算
        bool upWon;               // 涨方是否赢
        bool voided;              // 该轮无效（无人下注 / 价格无效 / 一边倒无胜方）→ 仅退代币不发奖
    }

    // [slotType][roundId] => Round
    mapping(uint8 => mapping(uint256 => Round)) public rounds;

    struct Bet {
        uint16 shares;
        bool isUp;
        bool claimed;
    }

    // [slotType][roundId][user] => Bet
    mapping(uint8 => mapping(uint256 => mapping(address => Bet))) public bets;

    /// @notice 储备池（用于补充某些边界情况）
    uint256 public reservePool;

    /// @notice 累计销毁代币
    uint256 public totalBurned;
    /// @notice 累计已分配的胜方奖金
    uint256 public totalWinnerPaid;
    /// @notice 累计税费总流入
    uint256 public totalInflow;
    /// @notice 待分配的税费 BNB（lazy allocation，避免 receive() 时 gas 爆炸）
    uint256 public pendingInflow;

    // ─────────────── Commission Fee (Flap Recommended Structure) ───────────────

    /// @notice 协议方手续费接收地址（Flap 推荐结构按公式从税费 BNB 中抽取）
    /// @dev 部署时 = creator；可由 creator 转移给多签
    address public feeRecipient;

    /// @notice 代币税率（basis points，由 receive 第一次回调时从 token 读取）
    /// 4% 税率 → 400 bps；按公式 fee = msg.value * 6 / 400 = 1.5%
    uint256 public taxRateBps;

    /// @notice 累计已收取手续费 BNB
    uint256 public totalFeeCollected;

    /// @notice 待发放给 feeRecipient 的手续费 BNB（pull 模式，避免 receive 转账失败）
    uint256 public pendingFee;

    event FeeAccrued(uint256 amount);
    event FeeWithdrawn(address indexed recipient, uint256 amount);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event TaxRateRefreshed(uint256 newRateBps);

    // ─────────────── Events ───────────────

    event RoundStarted(uint8 indexed slot, uint256 indexed roundId, uint256 startTime, uint256 endTime, uint256 openPrice);
    event BetPlaced(uint8 indexed slot, uint256 indexed roundId, address indexed user, bool isUp, uint16 shares, uint256 tokenAmount);
    event RoundSettled(uint8 indexed slot, uint256 indexed roundId, uint256 openPrice, uint256 closePrice, bool upWon, uint256 winnersPool, uint256 rolledOver, uint256 burned);
    event RoundVoid(uint8 indexed slot, uint256 indexed roundId, string reason);
    event Claimed(uint8 indexed slot, uint256 indexed roundId, address indexed user, uint256 tokenRefund, uint256 bnbWon);
    event TokensBurned(uint256 amount);
    event ParamsUpdated(uint256 sharePrice);
    event SlotInflowAllocated(uint8 indexed slot, uint256 amount);
    event EmergencyWithdrawnBNB(address indexed to, uint256 amount, address indexed by);
    event EmergencyWithdrawnToken(address indexed token, address indexed to, uint256 amount, address indexed by);

    // ─────────────── Constructor ───────────────

    constructor(address _token, address _creator) {
        require(_token != address(0) && _creator != address(0), "zero addr");
        token = IERC20(_token);
        creator = _creator;
        feeRecipient = _creator; // 默认 creator 收手续费，部署后可改为多签

        // 启动各档的第一个轮次
        for (uint8 i = 0; i < NUM_SLOTS; i++) {
            _startNewRound(i);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //                  Receive — 税费 BNB 入金分配
    // ═══════════════════════════════════════════════════════════════════

    receive() external payable {
        // PancakeSwap router 退款不计入分配
        if (msg.sender == PANCAKE_ROUTER) return;
        // 极简：只累加 pending，下次 placeBet/settle/claim 时再分配
        // 这样不会因为 gas 限制阻塞代币税费流入
        if (msg.value > 0) {
            pendingInflow += msg.value;
            totalInflow += msg.value;
        }
    }

    /// @dev Flush pending inflow into per-slot pools. Called from state-changing fns.
    /// 应用 Flap 推荐手续费结构：
    ///   - taxRate <= 100bps (≤1%) → fee = 6% of msg.value
    ///   - taxRate >  100bps (>1%) → fee = (msg.value * 6) / taxRateBps
    /// 例：4% 税 → fee = 6/400 = 1.5%
    function _flushInflow() internal {
        uint256 amount = pendingInflow;
        if (amount == 0) return;
        pendingInflow = 0;

        // 第一次或 taxRateBps 仍为 0 时，从代币读取真实税率
        if (taxRateBps == 0) {
            try IFlapTaxToken(address(token)).taxRate() returns (uint256 _r) {
                if (_r > 0) {
                    taxRateBps = _r;
                    emit TaxRateRefreshed(_r);
                }
            } catch {}
        }

        // 计算手续费（按 Flap 推荐公式）
        uint256 fee = 0;
        if (taxRateBps == 0 || taxRateBps <= 100) {
            // ≤1% 税率（或还没读到）→ 6% of inflow
            fee = (amount * 600) / 10_000;
        } else {
            fee = (amount * 6) / taxRateBps;
        }
        if (fee > amount) fee = amount; // safety

        uint256 netAmount = amount - fee;

        if (fee > 0) {
            pendingFee += fee;
            totalFeeCollected += fee;
            emit FeeAccrued(fee);
        }

        // 把 netAmount 分配到各档奖池 + 储备池
        for (uint8 i = 0; i < NUM_SLOTS; i++) {
            _maybeRollRound(i);
            uint256 slotShare = (netAmount * SLOT_INFLOW_BPS[i]) / BPS;
            if (slotShare > 0) {
                rounds[i][currentRoundId[i]].bnbPool += slotShare;
                emit SlotInflowAllocated(i, slotShare);
            }
        }

        uint256 reservePart = (netAmount * RESERVE_INFLOW_BPS) / BPS;
        reservePool += reservePart;
    }

    // ═══════════════════════════════════════════════════════════════════
    //                       Place Bet
    // ═══════════════════════════════════════════════════════════════════

    /// @notice 投注。份数 1-20，每份 sharePrice 个代币。
    /// @param slot 时间档 0=20min / 1=1h / 2=24h
    /// @param isUp true=押涨, false=押跌
    /// @param shares 份数 (1-20)
    function placeBet(uint8 slot, bool isUp, uint16 shares) external nonReentrant {
        require(slot < NUM_SLOTS, "bad slot");
        require(shares >= 1 && shares <= MAX_SHARES_PER_BET, "shares out of range");

        // 先把待分配 BNB 流入各档奖池
        _flushInflow();

        // 自动滚动到下一轮（如果当前轮已到结算时间）
        _maybeRollRound(slot);

        uint256 rid = currentRoundId[slot];
        Round storage round = rounds[slot][rid];

        // 投注窗口检查：必须在 endTime - BETTING_CLOSE_BEFORE 之前
        require(
            block.timestamp + BETTING_CLOSE_BEFORE[slot] < round.endTime,
            "betting closed"
        );

        // 一轮一注
        Bet storage existing = bets[slot][rid][msg.sender];
        require(existing.shares == 0, "already bet this round");

        // 转入代币
        uint256 tokenAmount = uint256(shares) * round.sharePriceLocked;
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);

        // 记录
        bets[slot][rid][msg.sender] = Bet({
            shares: shares,
            isUp: isUp,
            claimed: false
        });

        if (isUp) round.totalUpShares += shares;
        else round.totalDownShares += shares;

        emit BetPlaced(slot, rid, msg.sender, isUp, shares, tokenAmount);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                       Round Lifecycle
    // ═══════════════════════════════════════════════════════════════════

    /// @dev 检查并滚动当前轮次：如果到期则结算，开新轮
    function _maybeRollRound(uint8 slot) internal {
        uint256 rid = currentRoundId[slot];
        Round storage round = rounds[slot][rid];

        // 还没到结算时间
        if (block.timestamp < round.endTime) return;

        // 结算当前轮
        _settleRound(slot, rid);
        // 启动下一轮
        _startNewRound(slot);
    }

    /// @notice 任何人可以触发结算（应该被自动滚动覆盖，这是显式触发的备用）
    function settle(uint8 slot) external nonReentrant {
        require(slot < NUM_SLOTS, "bad slot");
        _flushInflow();
        uint256 rid = currentRoundId[slot];
        require(block.timestamp >= rounds[slot][rid].endTime, "not yet");
        _settleRound(slot, rid);
        _startNewRound(slot);
    }

    /// @notice Anyone can call to flush pending inflow into pools (free service)
    function flushInflow() external nonReentrant {
        _flushInflow();
    }

    function _startNewRound(uint8 slot) internal {
        // currentRoundId 从 0 开始；第一次调用变成 1，第一个 round ID = 1
        uint256 newId = ++currentRoundId[slot];

        Round storage round = rounds[slot][newId];
        round.startTime = block.timestamp;
        round.endTime = block.timestamp + SLOT_DURATIONS[slot];
        round.sharePriceLocked = sharePrice;

        // 记录开盘 TWAP 锚点
        (uint256 spotPrice, uint256 cumPrice, uint32 cumTs) = ButterflyPredictionLib
            .readPriceWithCumulative(address(token), _getPortal());
        round.openPrice = spotPrice;
        round.openPriceTwap = cumPrice;
        round.openTwapTimestamp = cumTs;

        emit RoundStarted(slot, newId, round.startTime, round.endTime, spotPrice);
    }

    function _settleRound(uint8 slot, uint256 rid) internal {
        Round storage round = rounds[slot][rid];
        if (round.settled) return;
        round.settled = true;

        // 边界情况：无人下注 → 整个 bnbPool 滚到下一轮
        if (round.totalUpShares == 0 && round.totalDownShares == 0) {
            round.voided = true;
            uint256 nextRid = currentRoundId[slot] + 1; // 下一轮 ID
            rounds[slot][nextRid].bnbPool += round.bnbPool;
            round.bnbPool = 0;
            emit RoundVoid(slot, rid, "no bets");
            return;
        }

        // 计算结算 TWAP 价格
        uint256 closePrice = ButterflyPredictionLib.computeTwapBetween(
            address(token),
            _getPortal(),
            round.openPriceTwap,
            round.openTwapTimestamp,
            uint32(block.timestamp)
        );
        // 如果 TWAP 算不出来（极少见），fallback 到 spot
        if (closePrice == 0) {
            (closePrice, , ) = ButterflyPredictionLib.readPriceWithCumulative(
                address(token),
                _getPortal()
            );
        }

        // 边界情况：开盘或结算价格无效 → 本轮全部滚下期，仅退代币不发奖
        if (round.openPrice == 0 || closePrice == 0) {
            uint256 nextRidVoid = currentRoundId[slot] + 1;
            rounds[slot][nextRidVoid].bnbPool += round.bnbPool;
            round.bnbPool = 0;
            round.voided = true;
            emit RoundVoid(slot, rid, "invalid price");
            return;
        }

        round.closePrice = closePrice;

        // 判断涨跌
        // 严格 > 算涨，<= 算跌（平手归跌方，避免无限循环情况）
        round.upWon = closePrice > round.openPrice;

        // 边界情况：胜方无下注（一边倒下注）→ 全部滚下期 + 烧毁部分
        uint256 winnerShares = round.upWon ? round.totalUpShares : round.totalDownShares;
        if (winnerShares == 0) {
            // 整个池子 90% 滚下期, 10% 烧毁
            uint256 toBurn = (round.bnbPool * BURN_BPS) / BPS;
            uint256 toRoll = round.bnbPool - toBurn;
            uint256 nextRid = currentRoundId[slot] + 1;
            rounds[slot][nextRid].bnbPool += toRoll;
            if (toBurn > 0) _buyAndBurn(toBurn);
            round.bnbPool = 0;
            emit RoundSettled(slot, rid, round.openPrice, closePrice, round.upWon, 0, toRoll, toBurn);
            return;
        }

        // 正常结算：70% 胜方 / 20% 滚下期 / 10% 烧毁
        uint256 winnersPool = (round.bnbPool * WINNERS_BPS) / BPS;
        uint256 rolloverPool = (round.bnbPool * ROLLOVER_BPS) / BPS;
        uint256 burnPool = round.bnbPool - winnersPool - rolloverPool;

        // 滚下期
        uint256 nextRoundId = currentRoundId[slot] + 1;
        rounds[slot][nextRoundId].bnbPool += rolloverPool;

        // 锁定胜方奖池（剩余的就是给胜方的）
        // bnbPool 现在等于 winnersPool（claim 时按比例分发）
        round.bnbPool = winnersPool;

        // 烧毁部分 → buy & burn
        if (burnPool > 0) _buyAndBurn(burnPool);

        emit RoundSettled(slot, rid, round.openPrice, closePrice, round.upWon, winnersPool, rolloverPool, burnPool);
    }

    /// @dev 用 BNB 在 DEX 买入代币然后送黑洞
    function _buyAndBurn(uint256 bnbAmount) internal {
        address[] memory path = new address[](2);
        path[0] = IPancakeRouter(PANCAKE_ROUTER).WETH();
        path[1] = address(token);

        uint256 balBefore = token.balanceOf(address(this));
        try IPancakeRouter(PANCAKE_ROUTER).swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: bnbAmount
        }(0, path, address(this), block.timestamp + 300) {
            uint256 bought = token.balanceOf(address(this)) - balBefore;
            if (bought > 0) {
                token.safeTransfer(DEAD, bought);
                totalBurned += bought;
                emit TokensBurned(bought);
            }
        } catch {
            // 买入失败（极端情况）→ 把 BNB 退回储备池
            reservePool += bnbAmount;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //                       Claim
    // ═══════════════════════════════════════════════════════════════════

    /// @notice 领取代币（输/赢都退）+ BNB 奖金（仅胜方）
    /// @param slot 档位
    /// @param rid 轮次 ID
    function claim(uint8 slot, uint256 rid) external nonReentrant {
        require(slot < NUM_SLOTS, "bad slot");
        Round storage round = rounds[slot][rid];
        require(round.settled, "not settled");

        Bet storage bet = bets[slot][rid][msg.sender];
        require(bet.shares > 0, "no bet");
        require(!bet.claimed, "claimed");
        bet.claimed = true;

        // 1. 退还代币（原数返还）
        uint256 tokenRefund = uint256(bet.shares) * round.sharePriceLocked;
        token.safeTransfer(msg.sender, tokenRefund);

        // 2. 检查是否赢
        uint256 bnbWon = 0;
        bool isWinner = (bet.isUp && round.upWon) || (!bet.isUp && !round.upWon);
        if (isWinner) {
            uint256 winnerShares = round.upWon ? round.totalUpShares : round.totalDownShares;
            // 防御：winnerShares 一定 > 0，否则 _settleRound 已走 noWinners 分支
            if (winnerShares > 0) {
                bnbWon = (round.bnbPool * uint256(bet.shares)) / winnerShares;
                if (bnbWon > 0) {
                    totalWinnerPaid += bnbWon;
                    (bool ok, ) = msg.sender.call{value: bnbWon}("");
                    require(ok, "bnb send fail");
                }
            }
        }

        emit Claimed(slot, rid, msg.sender, tokenRefund, bnbWon);
    }

    /// @notice 批量领取（一次最多 10 个 round，省 gas）
    function claimMany(uint8[] calldata slots, uint256[] calldata rids) external nonReentrant {
        require(slots.length == rids.length, "len mismatch");
        require(slots.length <= 10, "too many");
        for (uint256 i = 0; i < slots.length; i++) {
            _claimSingle(slots[i], rids[i]);
        }
    }

    function _claimSingle(uint8 slot, uint256 rid) internal {
        require(slot < NUM_SLOTS, "bad slot");
        Round storage round = rounds[slot][rid];
        if (!round.settled) return;
        Bet storage bet = bets[slot][rid][msg.sender];
        if (bet.shares == 0 || bet.claimed) return;
        bet.claimed = true;

        uint256 tokenRefund = uint256(bet.shares) * round.sharePriceLocked;
        token.safeTransfer(msg.sender, tokenRefund);

        uint256 bnbWon = 0;
        bool isWinner = (bet.isUp && round.upWon) || (!bet.isUp && !round.upWon);
        if (isWinner) {
            uint256 winnerShares = round.upWon ? round.totalUpShares : round.totalDownShares;
            if (winnerShares > 0) {
                bnbWon = (round.bnbPool * uint256(bet.shares)) / winnerShares;
                if (bnbWon > 0) {
                    totalWinnerPaid += bnbWon;
                    (bool ok, ) = msg.sender.call{value: bnbWon}("");
                    require(ok, "bnb send fail");
                }
            }
        }
        emit Claimed(slot, rid, msg.sender, tokenRefund, bnbWon);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                       View functions
    // ═══════════════════════════════════════════════════════════════════

    /// @notice 获取某档当前轮次的完整状态
    function getCurrentRound(uint8 slot) external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 openPrice,
        uint256 currentPrice,
        uint256 totalUpShares,
        uint256 totalDownShares,
        uint256 bnbPool,
        uint256 sharePriceLocked,
        uint256 secondsLeft,
        bool bettingOpen
    ) {
        require(slot < NUM_SLOTS, "bad slot");
        roundId = currentRoundId[slot];
        Round storage round = rounds[slot][roundId];
        startTime = round.startTime;
        endTime = round.endTime;
        openPrice = round.openPrice;
        (currentPrice, , ) = ButterflyPredictionLib.readPriceWithCumulative(address(token), _getPortal());
        totalUpShares = round.totalUpShares;
        totalDownShares = round.totalDownShares;
        bnbPool = round.bnbPool;
        sharePriceLocked = round.sharePriceLocked;
        secondsLeft = block.timestamp >= endTime ? 0 : endTime - block.timestamp;
        bettingOpen = block.timestamp + BETTING_CLOSE_BEFORE[slot] < endTime;
    }

    /// @notice 计算"如果现在用 X 份押 Y 方向，假设你赢了能拿多少 BNB"
    function previewPayout(uint8 slot, bool isUp, uint16 shares) external view returns (uint256 estimatedBnb) {
        require(slot < NUM_SLOTS, "bad slot");
        Round storage round = rounds[slot][currentRoundId[slot]];

        // 假设其他人不再下注的情况下
        uint256 simulatedWinShares = isUp
            ? round.totalUpShares + shares
            : round.totalDownShares + shares;
        if (simulatedWinShares == 0) return 0;

        // 70% 给胜方
        uint256 simulatedWinPool = (round.bnbPool * WINNERS_BPS) / BPS;
        estimatedBnb = (simulatedWinPool * uint256(shares)) / simulatedWinShares;
    }

    /// @notice 获取用户在某轮的下注状态
    function getMyBet(uint8 slot, uint256 rid) external view returns (
        uint16 shares,
        bool isUp,
        bool claimed,
        bool isWinner,
        bool roundSettled,
        uint256 estimatedClaim
    ) {
        Bet storage bet = bets[slot][rid][msg.sender];
        Round storage round = rounds[slot][rid];
        shares = bet.shares;
        isUp = bet.isUp;
        claimed = bet.claimed;
        roundSettled = round.settled;
        if (round.settled && shares > 0 && !claimed) {
            isWinner = (bet.isUp && round.upWon) || (!bet.isUp && !round.upWon);
            uint256 winnerShares = round.upWon ? round.totalUpShares : round.totalDownShares;
            if (isWinner && winnerShares > 0) {
                estimatedClaim = (round.bnbPool * uint256(shares)) / winnerShares;
            }
        }
    }

    function getProtocolStats() external view returns (
        uint256 _reservePool,
        uint256 _totalBurned,
        uint256 _totalWinnerPaid,
        uint256 _totalInflow,
        uint256 vaultBnbBalance,
        uint256 currentSharePrice
    ) {
        _reservePool = reservePool;
        _totalBurned = totalBurned;
        _totalWinnerPaid = totalWinnerPaid;
        _totalInflow = totalInflow;
        vaultBnbBalance = address(this).balance;
        currentSharePrice = sharePrice;
    }

    function getCurrentPrice() external view returns (uint256) {
        (uint256 spot, , ) = ButterflyPredictionLib.readPriceWithCumulative(address(token), _getPortal());
        return spot;
    }

    // ═══════════════════════════════════════════════════════════════════
    //                       Governance
    // ═══════════════════════════════════════════════════════════════════

    modifier onlyCreatorOrGuardian() {
        require(msg.sender == creator || msg.sender == _getGuardian(), "unauthorized");
        _;
    }

    modifier onlyGuardian() {
        require(msg.sender == _getGuardian(), "only guardian");
        _;
    }

    /// @notice 调整份额大小（仅对未来轮次生效）
    function setSharePrice(uint256 newPrice) external onlyCreatorOrGuardian {
        require(newPrice >= MIN_SHARE_PRICE && newPrice <= MAX_SHARE_PRICE, "out of range");
        sharePrice = newPrice;
        emit ParamsUpdated(newPrice);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                       Commission Fee Management
    // ═══════════════════════════════════════════════════════════════════

    /// @notice 提取累计手续费（任何人可调，钱永远只会进 feeRecipient 钱包）
    /// @dev pull 模式避免 receive 阶段转账失败阻塞流程
    function withdrawFee() external nonReentrant {
        uint256 amount = pendingFee;
        require(amount > 0, "no fee");
        require(feeRecipient != address(0), "no recipient");
        pendingFee = 0;
        (bool ok, ) = payable(feeRecipient).call{value: amount}("");
        require(ok, "send fail");
        emit FeeWithdrawn(feeRecipient, amount);
    }

    /// @notice 转移手续费接收地址（creator 用于将权限移交给多签）
    function setFeeRecipient(address newRecipient) external {
        require(msg.sender == creator || msg.sender == _getGuardian(), "unauthorized");
        require(newRecipient != address(0), "zero addr");
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    /// @notice 手动刷新代币税率（在代币税率变更后调用）
    function refreshTaxRate() external {
        try IFlapTaxToken(address(token)).taxRate() returns (uint256 _r) {
            if (_r > 0 && _r != taxRateBps) {
                taxRateBps = _r;
                emit TaxRateRefreshed(_r);
            }
        } catch {}
    }

    // ═══════════════════════════════════════════════════════════════════
    //                       Emergency Withdraw (Guardian only)
    // ═══════════════════════════════════════════════════════════════════

    /// @notice 紧急提取 BNB（Guardian 仅在严重 bug 或合约弃用时使用）
    function emergencyWithdrawBNB(address payable to, uint256 amount) external onlyGuardian nonReentrant {
        require(to != address(0), "bad addr");
        uint256 bal = address(this).balance;
        if (amount == 0 || amount > bal) amount = bal;
        require(amount > 0, "empty");
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "send fail");
        emit EmergencyWithdrawnBNB(to, amount, msg.sender);
    }

    /// @notice 紧急提取任意 BEP20 代币（包括 BFLY 自身和误转入的代币）
    function emergencyWithdrawToken(address tokenAddr, address to, uint256 amount) external onlyGuardian nonReentrant {
        require(to != address(0) && tokenAddr != address(0), "bad addr");
        uint256 bal = IERC20(tokenAddr).balanceOf(address(this));
        if (amount == 0 || amount > bal) amount = bal;
        require(amount > 0, "empty");
        IERC20(tokenAddr).safeTransfer(to, amount);
        emit EmergencyWithdrawnToken(tokenAddr, to, amount, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════════
    //                     VaultBase overrides
    // ═══════════════════════════════════════════════════════════════════

    function description() public view override returns (string memory) {
        return ButterflyPredictionLib.buildDescription(reservePool, totalBurned);
    }

    function vaultUISchema() public pure override returns (VaultUISchema memory schema) {
        return ButterflyPredictionLib.buildUISchema(schema);
    }
}
