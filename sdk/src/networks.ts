import { Networks } from '@stellar/stellar-sdk';
import type { ContractIds, NetworkConfig } from './types.js';

/** Testnet connection defaults. */
export const TESTNET: NetworkConfig = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
};

/** Mainnet (public network) connection defaults. */
export const MAINNET: NetworkConfig = {
  rpcUrl: 'https://mainnet.sorobanrpc.com',
  networkPassphrase: Networks.PUBLIC,
};

/** Futurenet connection defaults. */
export const FUTURENET: NetworkConfig = {
  rpcUrl: 'https://rpc-futurenet.stellar.org',
  networkPassphrase: Networks.FUTURENET,
};

/**
 * Deployed Arbitra testnet contract IDs, mirrored from
 * `frontend/lib/contracts/config.ts`. Mainnet has no canonical defaults yet —
 * pass your own `contractIds` to `ArbitraClient`.
 */
export const TESTNET_CONTRACT_IDS: ContractIds = {
  arbitraAgreement: 'CBFLJVOHQ2LRVUMYBZQCHCVP5JGZ6WFTOSMYYUZQHAPHX6JKSDQXF5JD',
  disputeResolution: 'CA4GNSPPX6RMHPKMJB5GSOKQU6WDPBEGMPSU3SJ5SEJWA5F7RFK2NN65',
  escrow: 'CDDUZKXCDSK3TZVFUUEEJRMSFNILCUEO5E5RORTREEH4KOALQC637DEZ',
  payment: 'CDXNI4WNAIFVVN5RIVETAENYYQ5OTT7TLFQSF2JWAHU3X3B3RT5KQBED',
  agentRegistry: 'CBJHWU7LO6QCIOBGS5P6V45FV4NT4RXCQNSGIYM5MUSP36QPAZFQRSSM',
  propertyRegistry: 'CAUHZN2FUPS7GVV2TYTUYCKG7CZX5NY7K6RA6INZ4KOGMUBRC4L4QJI7',
  rentObligation: 'CBGPDLUDTVHUR7HZPZ45CM6SYBISC2LQHMVVSEIVFA6WWZX24PIGDNOM',
  userProfile: 'CDEK2S5U36ELIGZW23EXHGYCWENGLMLHL47ZKQWPOMLO4GTK5O2YSMMH',
};
