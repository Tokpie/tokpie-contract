import ether from './helpers/ether';
import {advanceBlock} from './helpers/advanceToBlock';
import {increaseTimeTo, duration} from './helpers/increaseTime';
import latestTime from './helpers/latestTime';
import EVMRevert from './helpers/EVMRevert';

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545")); // Hardcoded development port

const BigNumber = web3.BigNumber;

const should = require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const Token = artifacts.require('Token');
const preICO = artifacts.require('preICO');
const ICO = artifacts.require('ICO');
const postICO = artifacts.require('postICO');
const Controller = artifacts.require('Controller');

contract('Controller', function (accounts) {

    const walletE = accounts[1];
    const walletB = accounts[2];
    const walletC = accounts[3];
    const walletF = accounts[4];
    const walletG = accounts[5];

    let wallet = accounts[9];
    let hardCap = ether(10);

    before(async function () {
        // Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
        await advanceBlock();
    });

    beforeEach(async function () {
        this.startTime = latestTime() + duration.weeks(1);
        this.closingTime = this.startTime + duration.weeks(1);
        this.startTimeICO = this.closingTime + duration.weeks(1);
        this.closingTimeICO = this.startTimeICO + duration.weeks(4);

        this.token = await Token.new();

        this.pre = await preICO.new(this.token.address, wallet, this.startTime, this.closingTime);
        this.ico = await ICO.new(this.token.address, wallet, this.startTimeICO, this.closingTimeICO, hardCap);
        this.post = await postICO.new(
            this.token.address,
            walletE,
            walletB,
            walletC,
            walletF,
            walletG,
            this.closingTimeICO);


        this.controller = await Controller.new(this.token.address, this.pre.address, this.ico.address, this.post.address);

        await this.token.transferOwnership(this.controller.address).should.be.fulfilled;

    });

    it('start preICO', async function () {
        await this.controller.startPreICO().should.be.fulfilled;
        await this.controller.startPreICO().should.be.rejected;

        let saleAgent = await this.token.saleAgent();
        saleAgent.should.be.equal(this.pre.address);
    });

    it('start ICO', async function () {
        await this.controller.startICO().should.be.rejected;
        await this.controller.startPreICO().should.be.fulfilled;
        await this.controller.startICO().should.be.rejected;

        await increaseTimeTo(this.closingTime + duration.seconds(1));

        await this.controller.startICO().should.be.fulfilled;
        await this.controller.startICO().should.be.rejected;

        let saleAgent = await this.token.saleAgent();
        saleAgent.should.be.equal(this.ico.address);
    });

    it('start post ICO', async function () {
        await this.controller.startPostICO().should.be.rejected;
        await this.controller.startPreICO().should.be.fulfilled;
        await this.controller.startPostICO().should.be.rejected;
        await increaseTimeTo(this.closingTime + duration.seconds(1));
        await this.controller.startPostICO().should.be.rejected;
        await this.controller.startICO().should.be.fulfilled;
        await this.controller.startPostICO().should.be.rejected;

        await increaseTimeTo(this.closingTimeICO + duration.seconds(1));

        await this.controller.startPostICO().should.be.fulfilled;
        await this.controller.startPostICO().should.be.rejected;


        let saleAgent = await this.token.saleAgent();
        saleAgent.should.be.equal(this.post.address);
    });
});
