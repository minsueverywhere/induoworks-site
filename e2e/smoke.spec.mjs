import {test,expect,expectNoHorizontalOverflow} from './fixtures.mjs';

test('home page renders the village without errors or overflow',async({page})=>{
  await page.goto('/');
  await expect(page.locator('canvas').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
