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

contract('preICO', function (accounts) {
    const value = ether(3);
    const value10 = ether(10);
    const goal = ether(500);
    const hardCap = ether(1000);
    const lessThanCap = ether(60);

    // about 0.05208 ether for 100 tokens
    const minTokensAmount = 53000000000000000;
    const lessThanGoal = ether(8);

    const maxEtherPerInvestor = ether(100);

    const cntToHardCap = hardCap.div(maxEtherPerInvestor);
    console.log("cntToHardCap=" + cntToHardCap);

    const rate = new BigNumber(1920);
    let wallet = accounts[9];
    let purchaser = accounts[1];
    let investor = accounts[2];
    let owner = accounts[0];
    let thirdparty = accounts[3];
    const expectedTokenAmount = rate.mul(value);

    before(async function () {
        // Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
        await advanceBlock();
    });

    beforeEach(async function () {
        this.startTime = latestTime() + duration.weeks(1);
        this.closingTime = this.startTime + duration.weeks(1);
        this.afterClosingTime = this.closingTime + duration.seconds(1);

        this.token = await Token.new();
        this.crowdsale = await preICO.new(this.token.address, wallet, this.startTime, this.closingTime);
        await this.token.setSaleAgent(this.crowdsale.address);
    });

    describe('high-level purchase', function () {
        it('should NOT accept payments before start date', async function () {
            await this.crowdsale.send(value, {from: purchaser}).should.be.rejected;
            await this.crowdsale.buyTokens(investor, {value: value, from: purchaser}).should.be.rejected;
        });

        it('should reject payments after end', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.crowdsale.send(value).should.be.rejectedWith(EVMRevert);
            await this.crowdsale.buyTokens(investor, {value: value, from: purchaser}).should.be.rejectedWith(EVMRevert);
        });

        it('should accept payments', async function () {
            await increaseTimeTo(this.startTime);
            await this.crowdsale.send(value, {from: purchaser}).should.be.fulfilled;
            await this.crowdsale.buyTokens(investor, {value: value, from: purchaser}).should.be.fulfilled;
        });

        it('should log purchase', async function () {
            await increaseTimeTo(this.startTime);

            const {logs} = await this.crowdsale.sendTransaction({value: value, from: investor});

            const event = logs.find(e => e.event === 'TokenPurchase');
            should.exist(event);
            event.args.purchaser.should.equal(investor);
            event.args.beneficiary.should.equal(investor);
            event.args.value.should.be.bignumber.equal(value);
            event.args.amount.should.be.bignumber.equal(expectedTokenAmount);
        });

        it('should assign tokens to sender', async function () {
            await increaseTimeTo(this.startTime);

            await this.crowdsale.sendTransaction({value: value, from: investor});
            let balance = await this.token.balanceOf(investor);
            balance.should.be.bignumber.equal(expectedTokenAmount);
        });

        it('should NOT forward funds to wallet before goal finalize', async function () {
            await increaseTimeTo(this.startTime);

            const pre = web3.eth.getBalance(wallet);

            await this.crowdsale.sendTransaction({value, from: investor});
            const post = web3.eth.getBalance(wallet);
            post.should.be.bignumber.equal(pre);
        });
    });

    describe('low-level purchase', function () {
        it('should buy only more than 100 tokens', async function () {
            await increaseTimeTo(this.startTime);
            await this.crowdsale.send(minTokensAmount, {from: purchaser}).should.be.fulfilled;
            await this.crowdsale.send(100, {from: purchaser}).should.be.rejectedWith(EVMRevert);
        });
    });

    describe('refund', function () {
        it('should deny refunds before end', async function () {
            await this.crowdsale.claimRefund({from: investor}).should.be.rejectedWith(EVMRevert);
            await increaseTimeTo(this.startTime);
            await this.crowdsale.claimRefund({from: investor}).should.be.rejectedWith(EVMRevert);
        });

        it('should deny refunds after end if goal was reached', async function () {
            await increaseTimeTo(this.startTime);
            for (let i = 0; i < cntToHardCap; i++) {
                await this.crowdsale.sendTransaction({value: maxEtherPerInvestor, from: accounts[30 + i]});
            }
            await increaseTimeTo(this.afterClosingTime);
            await this.crowdsale.finalize({from: owner});
            await this.crowdsale.claimRefund({from: investor}).should.be.rejectedWith(EVMRevert);
        });

        it('should allow refunds after end if goal was not reached', async function () {
            await increaseTimeTo(this.startTime);
            await this.crowdsale.sendTransaction({value: lessThanGoal, from: investor});
            await increaseTimeTo(this.afterClosingTime);
            await this.crowdsale.finalize({from: owner});
            const pre = web3.eth.getBalance(investor);
            await this.crowdsale.claimRefund({from: investor, gasPrice: 0})
                .should.be.fulfilled;
            const post = web3.eth.getBalance(investor);
            post.minus(pre).should.be.bignumber.equal(lessThanGoal);
        });

        it('should forward funds to wallet after end if goal was reached', async function () {
            await increaseTimeTo(this.startTime);

            for (let i = 0; i < cntToHardCap; i++) {
                await this.crowdsale.sendTransaction({value: maxEtherPerInvestor, from: accounts[30 + i]});
            }

            await increaseTimeTo(this.afterClosingTime);
            const pre = web3.eth.getBalance(wallet);
            await this.crowdsale.finalize({from: owner});
            const post = web3.eth.getBalance(wallet);
            post.minus(pre).should.be.bignumber.equal(hardCap);
        });
    });

    describe('finalizable crowdsale', function () {
        it('cannot be finalized before ending', async function () {
            await this.crowdsale.finalize({from: owner}).should.be.rejectedWith(EVMRevert);
        });

        it('cannot be finalized by third party after ending', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.crowdsale.finalize({from: thirdparty}).should.be.rejectedWith(EVMRevert);
        });

        it('can be finalized by owner after ending', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.crowdsale.finalize({from: owner}).should.be.fulfilled;
        });

        it('cannot be finalized twice', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.crowdsale.finalize({from: owner});
            await this.crowdsale.finalize({from: owner}).should.be.rejectedWith(EVMRevert);
        });

        it('logs finalized', async function () {
            await increaseTimeTo(this.afterClosingTime);
            const {logs} = await this.crowdsale.finalize({from: owner});
            const event = logs.find(e => e.event === 'Finalized');
            should.exist(event);
        });
    });
});
