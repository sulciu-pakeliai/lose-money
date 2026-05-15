import { test, expect } from "@playwright/test";

function uniqueEmail() {
    return `e2e_auth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
}

test("successful registration creates account and loads lobby", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Welcome to LoseMoney")).toBeVisible();
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await page.getByRole("button", { name: /create account/i }).click();

    const email = uniqueEmail();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("E2eRegister1!");
    await page.getByRole("button", { name: /create account/i, exact: true }).click();

    await expect(page.getByText("Welcome to LoseMoney")).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /lobby/i })).toBeVisible();
});

test("login with wrong password shows error and stays on login", async ({ page }) => {
    const email = uniqueEmail();
    await page.request.post("/api/auth/register", {
        data: { email, password: "CorrectPass1!" },
    });

    await page.goto("/");
    await expect(page.getByText("Welcome to LoseMoney")).toBeVisible();
    await page.getByRole("button", { name: /sign in/i }).first().click();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("WrongPassword999!");
    await page.getByRole("button", { name: /sign in/i, exact: true }).click();

    await expect(page.getByText(/invalid credentials/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Welcome to LoseMoney")).toBeVisible();
});
