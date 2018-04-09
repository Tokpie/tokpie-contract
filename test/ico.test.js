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
const ICO = artifacts.require('ICO');

contract('ICO', function (accounts) {
    const value = ether(3);
    const hardCap = ether(1000);
    const lessThanGoal = ether(8);

    const maxEtherPerInvestor = ether(100);
    const cntToHardCap = hardCap.div(maxEtherPerInvestor);

    let wallet = accounts[9];
    let purchaser = accounts[1];
    let investor = accounts[2];
    let owner = accounts[0];

    // about 0.05435 ether for 100 tokens
    const minTokensAmount = 54350000000000000;

    const rate1 = new BigNumber(1840);
    const rate2 = new BigNumber(1760);
    const rate3 = new BigNumber(1680);
    const rate4 = new BigNumber(1648);
    const rate5 = new BigNumber(1600);
    const expectedTokenAmount = rate1.mul(value);

    before(async function () {
        // Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
        await advanceBlock();
    });

    beforeEach(async function () {
        this.startTime = latestTime() + duration.weeks(1);
        this.closingTime = this.startTime + duration.weeks(4);
        this.afterClosingTime = this.closingTime + duration.seconds(1);

        this.token = await Token.new();
        this.crowdsale = await ICO.new(this.token.address, wallet, this.startTime, this.closingTime, hardCap);
        await this.token.setSaleAgent(this.crowdsale.address);
        await this.crowdsale.addToWhitelist(purchaser).should.be.fulfilled;
        await this.crowdsale.addToWhitelist(investor).should.be.fulfilled;
    });

    describe('high-level purchase', function () {
        it('should NOT accept payments before start date', async function () {
            await this.crowdsale.send(value).should.be.rejected;
            await this.crowdsale.buyTokens(investor, {value: value, from: purchaser}).should.be.rejected;
        });

        it('should reject payments after end', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.crowdsale.send(value).should.be.rejectedWith(EVMRevert);
            await this.crowdsale.buyTokens(investor, {value: value, from: purchaser}).should.be.rejectedWith(EVMRevert);
        });

        it('should accept payments', async function () {
            await increaseTimeTo(this.startTime);

            // owner is not in white list yet
            await this.crowdsale.send(value).should.be.rejectedWith(EVMRevert);

            await this.crowdsale.addToWhitelist(owner).should.be.fulfilled;
            await this.crowdsale.send(value).should.be.fulfilled;

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

        it('should NOT forward funds to wallet before goal finalize', async function () {
            await increaseTimeTo(this.startTime);

            const pre = web3.eth.getBalance(wallet);

            await this.crowdsale.sendTransaction({value, from: investor});
            const post = web3.eth.getBalance(wallet);
            post.should.be.bignumber.equal(pre);
        });
    });

    describe('rate during crowdsale should change', function () {
        let balance;
        it('stage 1', async function () {
            await increaseTimeTo(this.startTime);
            await this.crowdsale.buyTokens(investor, {value, from: purchaser});
            balance = await this.token.balanceOf(investor);
            balance.should.be.bignumber.equal(value.mul(rate1));
        });
        it('stage 2', async function () {
            await increaseTimeTo(this.startTime + 604680);
            await this.crowdsale.buyTokens(investor, {value, from: purchaser});
            balance = await this.token.balanceOf(investor);
            balance.should.be.bignumber.equal(value.mul(rate2));
        });
        it('stage 3', async function () {
            await increaseTimeTo(this.startTime + 1209480);
            await this.crowdsale.buyTokens(investor, {value, from: purchaser});
            balance = await this.token.balanceOf(investor);
            balance.should.be.bignumber.equal(value.mul(rate3));
        });
        it('stage 4', async function () {
            await increaseTimeTo(this.startTime + 1814280);
            await this.crowdsale.buyTokens(investor, {value, from: purchaser});
            balance = await this.token.balanceOf(investor);
            balance.should.be.bignumber.equal(value.mul(rate4));
        });
        it('stage 5', async function () {
            await increaseTimeTo(this.startTime + 2419080);
            await this.crowdsale.buyTokens(investor, {value, from: purchaser});
            balance = await this.token.balanceOf(investor);
            balance.should.be.bignumber.equal(value.mul(rate5));
        });
    });

    describe('low-level purchase', function () {
        it('should buy only more than 100 tokens', async function () {
            await increaseTimeTo(this.startTime);
            await this.crowdsale.sendTransaction({value: minTokensAmount, from: purchaser}).should.be.fulfilled;
            await this.crowdsale.sendTransaction({value: 100, from: purchaser}).should.be.rejectedWith(EVMRevert);
        });

        it('should buy only not more than maxEtherPerInvestor Ether for one investor', async function () {
            await increaseTimeTo(this.startTime);
            await this.crowdsale.addToWhitelist(owner).should.be.fulfilled;
            await this.crowdsale.send(maxEtherPerInvestor).should.be.fulfilled;
            await this.crowdsale.send(100).should.be.rejectedWith(EVMRevert);
        });
    });

    describe('capped crowdsale', function () {
        it('should reject payments outside cap', async function () {
            await increaseTimeTo(this.startTime);
            for (let i = 0; i < cntToHardCap; i++) {
                await this.crowdsale.addToWhitelist(accounts[30 + i]);
                await this.crowdsale.sendTransaction({value: maxEtherPerInvestor, from: accounts[30 + i]});
            }
            await this.crowdsale.send(1).should.be.rejectedWith(EVMRevert);
        });

        it('should reject payments that exceed cap', async function () {
            await increaseTimeTo(this.startTime);
            for (let i = 0; i < cntToHardCap; i++) {
                await this.crowdsale.addToWhitelist(accounts[30 + i]);
                await this.crowdsale.sendTransaction({value: maxEtherPerInvestor, from: accounts[30 + i]});
            }
            await this.crowdsale.send(1).should.be.rejectedWith(EVMRevert);
        });
    });

    describe('claim funds', function () {
        it('should not allow claim funds before end', async function () {
            await increaseTimeTo(this.startTime);
            await this.crowdsale.sendTransaction({value: lessThanGoal, from: investor});

            await this.crowdsale.claimFunds({from: owner, gasPrice: 0})
                .should.be.rejectedWith(EVMRevert);
        });

        it('should allow claim funds after end', async function () {
            await increaseTimeTo(this.startTime);
            await this.crowdsale.sendTransaction({value: lessThanGoal, from: investor});
            await increaseTimeTo(this.afterClosingTime);

            const pre = web3.eth.getBalance(wallet);

            await this.crowdsale.claimFunds({from: owner, gasPrice: 0})
                .should.be.fulfilled;

            const post = web3.eth.getBalance(wallet);
            post.minus(pre).should.be.bignumber.equal(lessThanGoal);
        });

        it('should allow claim funds after hard cap reached', async function () {
            await increaseTimeTo(this.startTime);
            for (let i = 0; i < cntToHardCap; i++) {
                await this.crowdsale.addToWhitelist(accounts[30 + i]);
                await this.crowdsale.sendTransaction({value: maxEtherPerInvestor, from: accounts[30 + i]});
            }
            const pre = web3.eth.getBalance(wallet);

            await this.crowdsale.claimFunds({from: owner, gasPrice: 0})
                .should.be.fulfilled;

            const post = web3.eth.getBalance(wallet);
            post.minus(pre).should.be.bignumber.equal(hardCap);
        });
    });
});
