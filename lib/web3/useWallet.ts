"use client";

import { useMemo } from "react";
import { useAccount, useChainId, useConnect, useDisconnect } from "wagmi";
import { useAppKit, useAppKitState } from "@reown/appkit/react";
import { chains as configuredChains } from "./wagmi.config";
import type { WalletContextValue, WalletProviderName } from "./index";

const providerIdMap: Record<WalletProviderName, string> = {
  MetaMask: "metaMask",
  "Coinbase Wallet": "coinbaseWallet",
  WalletConnect: "walletConnect",
  Phantom: "injected",
};

const connectorNameMap: Partial<Record<string, WalletProviderName>> = {
  metaMask: "MetaMask",
  coinbaseWallet: "Coinbase Wallet",
  walletConnect: "WalletConnect",
  injected: "Phantom",
};

export const useWallet = (): WalletContextValue => {
  const { open: openAppKit, close: closeAppKit } = useAppKit();
  const { open: isModalOpen } = useAppKitState();
  
  const { address, isConnected, isConnecting, connector } = useAccount();
  const chainId = useChainId();
  const { connectAsync, connectors: availableConnectors } = useConnect();
  const { disconnectAsync } = useDisconnect();

  const providerName = useMemo<WalletProviderName | null>(() => {
    if (!connector) return null;
    return connectorNameMap[connector.id] ?? null;
  }, [connector]);

  const chainName = useMemo(() => {
    return configuredChains.find((chain) => chain.id === chainId)?.name ?? null;
  }, [chainId]);

  const connect = async (provider: WalletProviderName = "MetaMask") => {
    // If user clicks WalletConnect, we might want to just open the AppKit modal
    if (provider === "WalletConnect") {
      await openAppKit();
      return;
    }

    const connectorId = providerIdMap[provider];
    const connector = availableConnectors.find((item) => item.id === connectorId);
    if (!connector) {
      // Fallback to opening the modal if specific connector is not found
      await openAppKit();
      return;
    }

    try {
      await connectAsync({ connector });
    } catch (error) {
      console.error("Connection failed", error);
    }
  };

  const disconnect = async () => {
    await disconnectAsync();
  };

  return {
    address: address ?? null,
    isConnected,
    isConnecting,
    chainId: chainId ?? null,
    chainName,
    providerName,
    isModalOpen,
    openModal: openAppKit,
    closeModal: closeAppKit,
    connect,
    disconnect,
  };
};
