export type WalletProviderName =
  | "MetaMask"
  | "Coinbase Wallet"
  | "WalletConnect"
  | "Phantom";

export type SwapSide = "BUY" | "SELL";

export interface PolymarketOrderParams {
  tokenId: string;
  usdcAmount: number;
  price: number;
  side: SwapSide;
  builderCode: string;
}

export interface PolymarketOrderPayload {
  order: {
    salt: string;
    maker: string;
    signer: string;
    taker: string;
    tokenId: string;
    makerAmount: string;
    takerAmount: string;
    expiration: string;
    nonce: string;
    feeRateBps: string;
    side: number;
    signatureType: number;
  };
  signature: string;
  orderType: "GTC";
  builderCode: string;
}

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
  chainName: string | null;
  providerName: WalletProviderName | null;
}

export interface WalletContextValue extends WalletState {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  connect: (provider?: WalletProviderName) => Promise<void>;
  disconnect: () => Promise<void>;
}
