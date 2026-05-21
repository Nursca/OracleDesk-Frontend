import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { polygon } from '@reown/appkit/networks'
import { arcTestnet } from "./chains";

// Get projectId from https://cloud.reown.com
export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!;

if (!projectId) {
  throw new Error('Project ID is not defined')
}

export const networks: [any, ...any[]] = [arcTestnet, polygon];

// Set up Wagmi Adapter
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
export { networks as chains };
