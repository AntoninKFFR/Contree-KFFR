import { expect, type Page } from "@playwright/test";

export async function expectNotFoundPage(page: Page, path: string) {
  const response = await page.goto(path);
  // Next App Router returns 200 for streamed notFound() and 404 before streaming.
  // Verify the actual rejection and SEO marker, not just the transport status.
  expect([200, 404]).toContain(response?.status());
  await expect(page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
}
