import { test, expect } from "../fixtures/auth";

test("successful coin flip updates balance and bet history", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: /Coin Flip Game/i }).click();
    await expect(page.getByRole("heading", { name: /heads or tails/i })).toBeVisible();

    const balanceBefore = await page
        .getByText(/₵\s*[\d,]+/)
        .first()
        .textContent();
    const before = Number(balanceBefore?.replace(/[^\d]/g, "") ?? "0");

    await page.getByRole("button", { name: "Heads", exact: true }).click();
    await page.getByPlaceholder(/enter bet/i).fill("10");
    await page.getByRole("button", { name: /flip coin/i }).click();

    await expect(page.getByText(/winner\.|missed it\./i)).toBeVisible({ timeout: 8_000 });

    const balanceAfter = await page
        .getByText(/₵\s*[\d,]+/)
        .first()
        .textContent();
    const after = Number(balanceAfter?.replace(/[^\d]/g, "") ?? "0");
    expect(after).not.toBe(before);

    await page.getByRole("button", { name: /history/i }).click();
    await expect(page.getByText(/coinflip|coin flip|flipzilla/i).first()).toBeVisible({ timeout: 6_000 });
});

test("coin flip with bet exceeding balance is rejected", async ({ authedPage: page }) => {
    await page.getByRole("button", { name: /Coin Flip Game/i }).click();
    await expect(page.getByRole("heading", { name: /heads or tails/i })).toBeVisible();

    await page.getByPlaceholder(/enter bet/i).fill("99999");

    const flipButton = page.getByRole("button", { name: /flip coin/i });
    const notEnough = page.getByText(/not enough balance/i);

    const isDisabled = await flipButton.isDisabled();
    const messageVisible = await notEnough.isVisible();
    expect(isDisabled || messageVisible).toBe(true);

    const balanceText = await page.getByText(/₵\s*[\d,]+/).first().textContent();
    const balance = Number(balanceText?.replace(/[^\d]/g, "") ?? "0");
    expect(balance).toBeGreaterThanOrEqual(0);
    expect(balance).toBeLessThan(99999);
});
