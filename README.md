This repository has the smart contracts for the Tokpie project. There are four main components in this repository including  Token contract, pre-ICO, ICO and post ICO contracts. In addition, we have a couple of mock modules that simulate testnet tokens.
This repository is for testing purposes only, do not use it for real deployment.

## Getting Started

This repository integrates with [Truffle](https://github.com/ConsenSys/truffle), the Ethereum development environment. Please install Truffle. Also you need [Ganache](https://github.com/trufflesuite/ganache-cli).

```sh
npm install -g truffle
npm install -g ganache-cli
```

Than you need to install all required depencies.
```sh
npm install
```

## Testnet deployment

We have a functional deployment running on ganache testnet.

```sh
./startGanache.sh
truffle test
```
