import { expect, test } from "@playwright/test";

test("renders the administrative shell", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Transmetro Administration" }),
  ).toBeVisible();
  await expect(page.getByText("Platform scaffold is ready.")).toBeVisible();
});
