import {advanceBlock} from './helpers/advanceToBlock';
import latestTime from './helpers/latestTime';
import {increaseTimeTo, duration} from './helpers/increaseTime';


const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545")); // Hardcoded development port

const BigNumber = web3.BigNumber;

const should = require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

const Token = artifacts.require('Token');
const postICO = artifacts.require('postICO');

contract('postICO', function (accounts) {


    const walletE = accounts[1];
    const walletB = accounts[2];
    const walletC = accounts[3];
    const walletF = accounts[4];
    const walletG = accounts[5];

    const investor = accounts[6];
    const saleAgent = accounts[7];

    const tokensAmount = new BigNumber(65000).mul(10 ** 18);

    before(async function () {
        // Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
        await advanceBlock();
    });

    beforeEach(async function () {
        this.closingTime = latestTime() + duration.weeks(1);
        this.afterClosingTime = this.closingTime + duration.seconds(1);

        this.token = await Token.new();
        this.postICO = await postICO.new(
            this.token.address,
            walletE,
            walletB,
            walletC,
            walletF,
            walletG,
            this.closingTime);

        await this.token.setSaleAgent(saleAgent);
        await this.token.mint(investor, tokensAmount, {from: saleAgent});

        await this.token.setSaleAgent(this.postICO.address);
    });

    describe('finish', function () {
        let FTST;

        it('should NOT finish before end date', async function () {
            await this.postICO.finish().should.be.rejected;
        });

        it('should finish after end date', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.postICO.finish().should.be.fulfilled;
        });

        it('should finish only 1 time', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.postICO.finish();
            await this.postICO.finish().should.be.rejected;
        });

        it('check payment sizes and wallet balances after finish', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.postICO.finish().should.be.fulfilled;

            FTST = await this.postICO.FTST();
            FTST.should.be.bignumber.equal(tokensAmount.mul(100).div(65));

            let paymentSizeE_expected = FTST.mul(2625).div(100000);
            let paymentSizeB_expected = FTST.mul(25).div(10000);
            let paymentSizeC_expected = FTST.mul(215).div(10000);

            let part1 = paymentSizeE_expected.mul(8);
            let part2 = paymentSizeB_expected.mul(4);
            let part3 = paymentSizeC_expected.mul(4);
            let tokensOnContract = part1.add(part2).add(part3);

            let balance = await this.token.balanceOf(this.postICO.address);
            balance.should.be.bignumber.equal(tokensOnContract);

            let paymentSizeE = await this.postICO.paymentSizeE();
            paymentSizeE.should.be.bignumber.equal(paymentSizeE_expected);

            let paymentSizeB = await this.postICO.paymentSizeB();
            paymentSizeB.should.be.bignumber.equal(paymentSizeB_expected);

            let paymentSizeC = await this.postICO.paymentSizeC();
            paymentSizeC.should.be.bignumber.equal(paymentSizeC_expected);


            let tokensF_expected = FTST.mul(2).div(100);
            let tokensF = await this.token.balanceOf(walletF);
            tokensF.should.be.bignumber.equal(tokensF_expected);

            let tokensG_expected = FTST.mul(24).div(1000);
            let tokensG = await this.token.balanceOf(walletG);
            tokensG.should.be.bignumber.equal(tokensG_expected);
        });
    });

    describe('claim reserve: 21% (4-years lock)', function () {
        it('order 1-8', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.postICO.finish().should.be.fulfilled;

            await this.postICO.claimTokensE(1).should.be.rejected;
            await this.postICO.claimTokensE(0).should.be.rejected;
            await this.postICO.claimTokensE(9).should.be.rejected;
            await increaseTimeTo(this.closingTime + 15724800);
            await this.postICO.claimTokensE(1).should.be.fulfilled;
            await this.postICO.claimTokensE(0).should.be.rejected;
            await this.postICO.claimTokensE(9).should.be.rejected;
        });


        it('check claim orders', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.postICO.finish().should.be.fulfilled;

            // before claim time
            await this.postICO.claimTokensE(1).should.be.rejected;

            // claim 1 time
            await increaseTimeTo(this.closingTime + 15724800);
            await this.postICO.claimTokensE(1).should.be.fulfilled;

            let paymentSizeE = await this.postICO.paymentSizeE();

            let tokensE = await this.token.balanceOf(walletE);
            tokensE.should.be.bignumber.equal(paymentSizeE);

            // claim 2 time
            await increaseTimeTo(this.closingTime + 31536000);
            await this.postICO.claimTokensE(2).should.be.fulfilled;
            tokensE = await this.token.balanceOf(walletE);
            tokensE.should.be.bignumber.equal(paymentSizeE.mul(2));

            // claim 3 time
            await increaseTimeTo(this.closingTime + 47260800);
            await this.postICO.claimTokensE(3).should.be.fulfilled;
            tokensE = await this.token.balanceOf(walletE);
            tokensE.should.be.bignumber.equal(paymentSizeE.mul(3));

            // claim 4 time
            await increaseTimeTo(this.closingTime + 63072000);
            await this.postICO.claimTokensE(4).should.be.fulfilled;
            tokensE = await this.token.balanceOf(walletE);
            tokensE.should.be.bignumber.equal(paymentSizeE.mul(4));

            // claim 5 time
            await increaseTimeTo(this.closingTime + 78796800);
            await this.postICO.claimTokensE(5).should.be.fulfilled;
            tokensE = await this.token.balanceOf(walletE);
            tokensE.should.be.bignumber.equal(paymentSizeE.mul(5));

            // claim 6 time
            await increaseTimeTo(this.closingTime + 94608000);
            await this.postICO.claimTokensE(6).should.be.fulfilled;
            tokensE = await this.token.balanceOf(walletE);
            tokensE.should.be.bignumber.equal(paymentSizeE.mul(6));

            // claim 7 time
            await increaseTimeTo(this.closingTime + 110332800);
            await this.postICO.claimTokensE(7).should.be.fulfilled;
            tokensE = await this.token.balanceOf(walletE);
            tokensE.should.be.bignumber.equal(paymentSizeE.mul(7));

            // claim 8 time
            await increaseTimeTo(this.closingTime + 126144000);
            await this.postICO.claimTokensE(8).should.be.fulfilled;
            tokensE = await this.token.balanceOf(walletE);
            tokensE.should.be.bignumber.equal(paymentSizeE.mul(8));

            // check total amount for wallet E, should be 21% FTST
            let FTST = await this.postICO.FTST();
            tokensE.should.be.bignumber.equal(FTST.mul(21).div(100));

            await this.postICO.claimTokensE(8).should.be.rejected;
        });
    });

    describe('claim reserve: team: 9.6% (2-years lock)', function () {
        it('order 1-4', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.postICO.finish().should.be.fulfilled;

            await this.postICO.claimTokensE(1).should.be.rejected;
            await this.postICO.claimTokensE(0).should.be.rejected;
            await this.postICO.claimTokensE(5).should.be.rejected;
            await increaseTimeTo(this.closingTime + 15724800);
            await this.postICO.claimTokensE(1).should.be.fulfilled;
            await this.postICO.claimTokensE(0).should.be.rejected;
            await this.postICO.claimTokensE(5).should.be.rejected;
        });


        it('check claim orders', async function () {
            await increaseTimeTo(this.afterClosingTime);
            await this.postICO.finish().should.be.fulfilled;

            // before claim time
            await this.postICO.claimTokensBC(1).should.be.rejected;

            // claim 1 time
            await increaseTimeTo(this.closingTime + 15724800);
            await this.postICO.claimTokensBC(1).should.be.fulfilled;

            let paymentSizeB = await this.postICO.paymentSizeB();
            let paymentSizeC = await this.postICO.paymentSizeC();

            let tokensB = await this.token.balanceOf(walletB);
            let tokensC = await this.token.balanceOf(walletC);
            tokensB.should.be.bignumber.equal(paymentSizeB);
            tokensC.should.be.bignumber.equal(paymentSizeC);

            // claim 2 time
            await increaseTimeTo(this.closingTime + 31536000);
            await this.postICO.claimTokensBC(2).should.be.fulfilled;
            tokensB = await this.token.balanceOf(walletB);
            tokensC = await this.token.balanceOf(walletC);
            tokensB.should.be.bignumber.equal(paymentSizeB.mul(2));
            tokensC.should.be.bignumber.equal(paymentSizeC.mul(2));

            // claim 3 time
            await increaseTimeTo(this.closingTime + 47260800);
            await this.postICO.claimTokensBC(3).should.be.fulfilled;
            tokensB = await this.token.balanceOf(walletB);
            tokensC = await this.token.balanceOf(walletC);
            tokensB.should.be.bignumber.equal(paymentSizeB.mul(3));
            tokensC.should.be.bignumber.equal(paymentSizeC.mul(3));

            // claim 4 time
            await increaseTimeTo(this.closingTime + 63072000);
            await this.postICO.claimTokensBC(4).should.be.fulfilled;
            tokensB = await this.token.balanceOf(walletB);
            tokensC = await this.token.balanceOf(walletC);
            tokensB.should.be.bignumber.equal(paymentSizeB.mul(4));
            tokensC.should.be.bignumber.equal(paymentSizeC.mul(4));

            // check total amount for wallet B+C, should be 9.6% FTST
            let FTST = await this.postICO.FTST();
            let total = tokensB.add(tokensC);
            total.should.be.bignumber.equal(FTST.mul(96).div(1000));

            await this.postICO.claimTokensBC(4).should.be.rejected;
        });

    });


});
