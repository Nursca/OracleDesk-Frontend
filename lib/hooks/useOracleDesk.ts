"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { arcTestnet, polygonAmoy } from "@/lib/web3/chains";
import {
  CONTRACTS,
  REASONING_HASHER_ABI,
  MARKET_FACTORY_ABI,
  ERC20_ABI,
  formatUsdc,
} from "@/lib/web3/contracts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnChainTrace {
  marketId: `0x${string}`;
  ipfsCid: string;
  sha256Hash: `0x${string}`;
  blockTimestamp: number;
  agentWallet: `0x${string}`;
  isVerified: boolean;
}

export interface OnChainMarket {
  marketId: `0x${string}`;
  question: string;
  yesProbability: number; // 0-100
  totalLiquidityUsdc: number;
  expiryTimestamp: number;
  isResolved: boolean;
  settlementCurrency: `0x${string}`;
}

// ─── Hook: Read a single reasoning trace from Arc ────────────────────────────

export function useReasoningTrace(marketId: `0x${string}` | undefined) {
  const { data, isLoading, isError, error } = useReadContract({
    address: CONTRACTS.arc.reasoningHasher,
    abi: REASONING_HASHER_ABI,
    functionName: "getTrace",
    args: marketId ? [marketId] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!marketId },
  });

  if (!data) return { trace: null, isLoading, isError, error };

  const [ipfsCid, sha256Hash, blockTimestamp, agentWallet] = data as any;

  const trace: OnChainTrace = {
    marketId: marketId!,
    ipfsCid,
    sha256Hash,
    blockTimestamp: Number(blockTimestamp),
    agentWallet,
    // Verification: IPFS CID must be non-empty and timestamp must be > 0
    isVerified: !!ipfsCid && Number(blockTimestamp) > 0,
  };

  return { trace, isLoading, isError, error };
}

// ─── Hook: Read a market from the Arc factory ────────────────────────────────

export function useArcMarket(marketId: `0x${string}` | undefined) {
  const { data, isLoading, isError } = useReadContract({
    address: CONTRACTS.arc.marketFactory,
    abi: MARKET_FACTORY_ABI,
    functionName: "getMarket",
    args: marketId ? [marketId] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!marketId },
  });

  if (!data) return { market: null, isLoading, isError };

  const [question, yesProbRaw, totalLiqRaw, expiryRaw, isResolved, settlementCurrency] = data as any;

  const market: OnChainMarket = {
    marketId: marketId!,
    question,
    yesProbability: Number(yesProbRaw) / 100, // contract stores as bps (6800 = 68%)
    totalLiquidityUsdc: formatUsdc(totalLiqRaw),
    expiryTimestamp: Number(expiryRaw),
    isResolved,
    settlementCurrency,
  };

  return { market, isLoading, isError };
}

// ─── Hook: Read all Arc market IDs ───────────────────────────────────────────

export function useAllArcMarkets() {
  const { data: marketIds, isLoading, isError } = useReadContract({
    address: CONTRACTS.arc.marketFactory,
    abi: MARKET_FACTORY_ABI,
    functionName: "getAllMarkets",
    chainId: arcTestnet.id,
  });

  return { marketIds: marketIds ?? [], isLoading, isError };
}

// ─── Hook: Check USDC balance on a given chain ───────────────────────────────

export function useUsdcBalance(
  address: `0x${string}` | undefined,
  chainId: number,
) {
  const usdcAddress =
    chainId === arcTestnet.id ? CONTRACTS.arc.usdc : CONTRACTS.polygon.usdc;

  const { data, isLoading, refetch } = useReadContract({
    address: usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: !!address, refetchInterval: 15_000 }, // refresh every 15 s
  });

  return {
    rawBalance: data ?? 0n,
    balance: formatUsdc(data ?? 0n),
    isLoading,
    refetch,
  };
}

// ─── Hook: Check USDC allowance for Polymarket CTF Exchange ─────────────────

export function usePolymarketAllowance(owner: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: CONTRACTS.polygon.usdc,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: owner
      ? [owner, CONTRACTS.polygon.polymarketCTFExchange]
      : undefined,
    chainId: polygonAmoy.id, // Polygon Amoy
    query: { enabled: !!owner },
  });

  return {
    allowance: data ?? 0n,
    isLoading,
    refetch,
  };
}

// ─── Dual-chain balance (Arc + Polygon USDC) via multicall ───────────────────

export function useDualChainBalance(address: `0x${string}` | undefined) {
  const arcBalance = useUsdcBalance(address, arcTestnet.id);
  const polygonBalance = useUsdcBalance(address, 80001);

  return {
    arcUsdc: arcBalance.balance,
    polygonUsdc: polygonBalance.balance,
    totalUsdc: arcBalance.balance + polygonBalance.balance,
    isLoading: arcBalance.isLoading || polygonBalance.isLoading,
    refetch: () => {
      arcBalance.refetch();
      polygonBalance.refetch();
    },
  };
}