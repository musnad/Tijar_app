import { describe, expect, it } from "vitest";

import {
  inferGrossFromLanded,
  platformFeeSplit,
  saleFeeSplit,
  saleTopUpKeep,
  walletInboundSplit,
} from "./platform-fee";

describe("inferGrossFromLanded", () => {
  it("recovers ₦10,000 when Corvi credits ₦9,900", () => {
    expect(inferGrossFromLanded(9900)).toBe(10000);
  });

  it("does not inflate a round ₦10,000 credit that is already gross", () => {
    expect(inferGrossFromLanded(10000)).toBe(10000);
  });
});

describe("wallet inbound 2% (1% Corvi + 1% TIJAR)", () => {
  it("leaves the user 98% when Corvi reported net", () => {
    const split = walletInboundSplit(9900);
    expect(split.gross).toBe(10000);
    expect(split.corvFee).toBe(100);
    expect(split.tijarKeep).toBe(100);
    expect(split.userNet).toBe(9800);
    expect(moneySum(split.userNet, split.tijarKeep, split.corvFee)).toBe(10000);
  });

  it("still takes TIJAR 1% when Corvi reported the send amount", () => {
    const split = walletInboundSplit(10000);
    expect(split.gross).toBe(10000);
    expect(split.corvFee).toBe(0);
    expect(split.tijarKeep).toBe(100);
    expect(split.userNet).toBe(9900);
  });
});

describe("sale 3% with Corvi charged from TIJAR’s share", () => {
  it("seller keeps 97%, Corvi 1%, TIJAR 2%", () => {
    const split = saleFeeSplit(10000, "corv");
    expect(split.totalFee).toBe(300);
    expect(split.corvFee).toBe(100);
    expect(split.tijarKeep).toBe(200);
    expect(split.sellerNet).toBe(9700);
    expect(moneySum(split.sellerNet, split.corvFee, split.tijarKeep)).toBe(10000);
  });

  it("keeps the ₦50 minimum on the 3% total, then Corvi comes out of that", () => {
    const split = saleFeeSplit(1000, "corv");
    expect(split.totalFee).toBe(50);
    expect(split.corvFee).toBe(10);
    expect(split.tijarKeep).toBe(40);
    expect(split.sellerNet).toBe(950);
  });

  it("gives TIJAR the full 3% when Corvi is not the processor", () => {
    const split = saleFeeSplit(10000, "paystack");
    expect(split.totalFee).toBe(300);
    expect(split.corvFee).toBe(0);
    expect(split.tijarKeep).toBe(300);
    expect(split.sellerNet).toBe(9700);
  });

  it("only tops up the extra TIJAR keep after a 1% wallet fee on the same transfer", () => {
    const wallet = walletInboundSplit(9900);
    const sale = saleFeeSplit(10000, "corv");
    expect(saleTopUpKeep(sale.tijarKeep, wallet.tijarKeep)).toBe(100);
  });
});

describe("platformFeeSplit seller preview", () => {
  it("shows the 3% seller take", () => {
    const split = platformFeeSplit(10000);
    expect(split.fee).toBe(300);
    expect(split.net).toBe(9700);
  });
});

function moneySum(...parts: number[]) {
  return Math.round(parts.reduce((n, p) => n + p, 0) * 100) / 100;
}
