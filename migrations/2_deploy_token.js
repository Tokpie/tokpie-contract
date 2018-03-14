const Token = artifacts.require('Token');

module.exports = async function (deployer, network, accounts) {
    deployer.deploy(Token);
};
