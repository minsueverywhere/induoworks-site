import {test,expect,expectNoHorizontalOverflow} from './fixtures.mjs';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';

const repo=resolve(import.meta.dirname,'..'),client=resolve(repo,'dist/client'),SITE='https://induo.works';
const catalog=JSON.parse(readFileSync(resolve(repo,'content/catalog.json'),'utf8'));
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):e.name==='index.html'?[dir]:[]);
const pages=walk(client).map(dir=>'/'+relative(client,dir).split(sep).filter(Boolean).map(s=>s+'/').join('')).sort();
const locs=file=>[...readFileSync(resolve(client,file),'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
const sitemapXml=readFileSync(resolve(client,'sitemap-0.xml'),'utf8');
const redirects=readFileSync(resolve(client,'_redirects'),'utf8').split('\n').map(l=>l.trim().split(/\s+/)).filter(p=>p.length>=2&&!p[0].startsWith('#'));
const noindex=path=>/<meta name="robots" content="noindex/.test(readFileSync(resolve(client,'.'+path,'index.html'),'utf8'));
const langOf=path=>path.startsWith('/ko/')?'ko':'en';
const baseOf=path=>path.replace(/^\/ko\//,'/');
const localize=(base,lang)=>lang==='ko'?'/ko'+base:base;
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const DETAIL_ID='yggbound',detailUrl=path=>baseOf(path)==='/work/detail/'?path+'?id='+DETAIL_ID:path;
// [visible h1, <title> prefix] per locale; work pages come from the catalog.
const fixed={
  '/':{en:['Induohood',''],ko:['Induohood','']},
  '/work/':{en:['Works','Works'],ko:['작업물','작업물']},
  '/workers/':{en:['Workers','Workers'],ko:['함께하는 사람들','함께하는 사람들']},
  '/contact/':{en:['Contact','Contact'],ko:['문의','문의']},
  '/careers/':{en:['Careers','Careers'],ko:['채용','채용']},
  '/companies/':{en:['Induo Works group','Companies'],ko:['Induo Works 그룹','계열사']},
  '/showcase/':{en:['About this site','About this site'],ko:['사이트 정보','사이트 정보']},
  '/labs/':{en:['Experiments','Experiments'],ko:['실험실','실험실']},
};
function expected(path) {
  const lang=langOf(path),base=baseOf(path);
  if(fixed[base])return fixed[base][lang];
  const slug=base==='/work/detail/'?DETAIL_ID:base.match(/^\/work\/([^/]+)\/$/)?.[1];
  const project=catalog.projects.find(p=>p.slug===slug);
  return project&&[project.title[lang],project.title[lang]];
}
const nav={en:['Induohood','Works','Workers','Contact'],ko:['Induohood','작업물','함께하는 사람들','문의']},navPaths=['/','/work/','/workers/','/contact/'];
const visibleH1=page=>page.locator('h1').filter({visible:true});
// Content-driven pages mark their root once the catalog (remote or embedded) has been applied.
const settle=page=>page.waitForFunction(()=>{const root=document.querySelector('#work-board,#workers-content,#work-detail,#village-section');return !root||!!root.dataset.contentSource;});
const isMobile=testInfo=>testInfo.project.name==='mobile';
const desktopOnly=testInfo=>test.skip(isMobile(testInfo),'viewport-independent HTTP check');
async function openNav(page,testInfo) {
  if(!isMobile(testInfo))return page.locator('#primary-nav');
  const toggle=page.locator('#menu-toggle');
  if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
  return page.locator('#mobile-menu');
}

test('the build exposes both locales of every public page',({},testInfo)=>{
  desktopOnly(testInfo);
  expect(pages.length).toBeGreaterThanOrEqual(20);
  const bases=[...new Set(pages.map(baseOf))];
  for(const base of bases)expect(pages,`${base} needs an en and a ko build`).toEqual(expect.arrayContaining([base,localize(base,'ko')]));
  for(const project of catalog.projects)expect(pages).toContain('/work/'+project.slug+'/');
});

for(const path of pages)test(`${path} renders its localized page`,async({page})=>{
  const want=expected(path),lang=langOf(path),base=baseOf(path);
  expect(want,'no expectations recorded for '+path).toBeTruthy();
  const [heading,title]=want,response=await page.goto(detailUrl(path));
  expect(response.status()).toBe(200);
  await settle(page);
  await expect(page.locator('html')).toHaveAttribute('lang',lang);
  await expect(visibleH1(page)).toHaveCount(1);
  await expect(visibleH1(page)).toHaveText(heading);
  await expect(page).toHaveTitle(title?new RegExp('^'+esc(title)+' . Induo Works$'):'Induo Works');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content',/\S/);
  const select=page.locator('#site-language');
  await expect(select).toHaveValue(path);
  await expect(select.locator('option[lang="en"]')).toHaveAttribute('value',base);
  await expect(select.locator('option[lang="ko"]')).toHaveAttribute('value',localize(base,'ko'));
  if(!noindex(path)) {
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',SITE+path);
    for(const l of ['en','ko'])await expect(page.locator(`link[rel="alternate"][hreflang="${l}"]`)).toHaveAttribute('href',SITE+localize(base,l));
  }
  await expectNoHorizontalOverflow(page);
});

test('unknown URLs get a 404 status and the not-found view',async({page})=>{
  for(const path of ['/no-such-page/','/work/not-a-project/']) {
    const response=await page.goto(path);
    expect(response.status(),path).toBe(404);
    await expect(page.locator('html')).toHaveAttribute('lang','en');
    await expect(visibleH1(page)).toHaveText('Page not found');
    await expect(page).toHaveTitle('Page not found · Induo Works');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
  expect(await page.locator('#site-language option').evaluateAll(os=>os.map(o=>o.value))).toEqual(['/','/ko/']);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('link',{name:'Back to home'}).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(visibleH1(page)).toHaveText('Induohood');
});

test('unknown Korean URL renders the Korean not-found view',async({page})=>{
  test.fail(true,'BUG: only an English 404.html is built, so /ko/* misses show English copy with lang="en"');
  const response=await page.goto('/ko/no-such-page/');
  expect(response.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('lang','ko',{timeout:2000});
  await expect(visibleH1(page)).toHaveText('페이지를 찾을 수 없습니다');
  await expect(page.getByRole('link',{name:'홈으로 돌아가기'})).toHaveAttribute('href','/ko/');
});

test('_redirects rules answer with their status and land on a live page',async({request},testInfo)=>{
  desktopOnly(testInfo);
  expect(redirects.map(r=>r[0])).toEqual(expect.arrayContaining(['/labs/gpu-interference/','/ko/labs/gpu-interference/']));
  for(const [from,to,status='302'] of redirects) {
    const hop=await request.get(from,{maxRedirects:0});
    expect(hop.status(),from).toBe(Number(status));
    expect(hop.headers().location,from).toBe(to);
    const final=await request.get(from);
    expect(final.status(),from).toBe(200);
    expect(new URL(final.url()).pathname).toBe(to);
    if(to.endsWith('.png'))expect(final.headers()['content-type']).toBe('image/png');
  }
});

test('the removed GPU experiment lands on the localized works page',async({page})=>{
  for(const lang of ['en','ko']) {
    await page.goto(localize('/labs/gpu-interference/',lang));
    await expect(page).toHaveURL(new RegExp(esc(localize('/work/',lang))+'$'));
    await expect(page.locator('html')).toHaveAttribute('lang',lang);
    await expect(visibleH1(page)).toHaveText(fixed['/work/'][lang][0]);
  }
});

test('sitemap URLs and hreflang alternates are all built pages',async({request},testInfo)=>{
  desktopOnly(testInfo);
  expect(locs('sitemap-index.xml')).toEqual([SITE+'/sitemap-0.xml']);
  const listed=locs('sitemap-0.xml');
  for(const url of listed) {
    expect(url.startsWith(SITE+'/')).toBe(true);
    const path=url.slice(SITE.length);
    expect(pages,url).toContain(path);
    expect((await request.get(path)).status(),path).toBe(200);
  }
  for(const path of pages.filter(p=>!noindex(p)))expect(listed,'indexable page missing from sitemap').toContain(SITE+path);
  for(const [,href] of sitemapXml.matchAll(/hreflang="[^"]+" href="([^"]+)"/g))expect(pages).toContain(href.slice(SITE.length));
  expect(await (await request.get('/robots.txt')).text()).toContain(SITE+'/sitemap-index.xml');
});

test('sitemap leaves out noindex pages',async({},testInfo)=>{
  desktopOnly(testInfo);
  test.fail(true,'BUG: sitemap-0.xml lists noindex pages (/work/detail/, /companies/ and their /ko/ twins)');
  const listed=locs('sitemap-0.xml').map(url=>url.slice(SITE.length));
  expect(listed.filter(noindex)).toEqual([]);
});

test('primary navigation moves between sections and marks the current one',async({page},testInfo)=>{
  for(const lang of ['en','ko']) {
    await page.goto(localize('/showcase/',lang));
    let links=(await openNav(page,testInfo)).getByRole('link');
    await expect(links).toHaveText(nav[lang]);
    await expect((await openNav(page,testInfo)).locator('[aria-current="page"]')).toHaveCount(0);
    for(const [i,label] of nav[lang].entries()) {
      const target=localize(navPaths[i],lang);
      await (await openNav(page,testInfo)).getByRole('link',{name:label,exact:true}).click();
      await expect(page).toHaveURL(new RegExp(esc(target)+'$'));
      await expect(page.locator('html')).toHaveAttribute('lang',lang);
      links=(await openNav(page,testInfo)).getByRole('link');
      await expect(links.and(page.locator('[aria-current="page"]'))).toHaveText([label]);
    }
  }
});

test('section highlighting follows nested routes',async({page},testInfo)=>{
  for(const [path,label] of [['/work/grench-boss/','Works'],['/ko/work/detail/?id=yggbound','작업물'],['/labs/','Works'],['/ko/careers/',null]]) {
    await page.goto(path);
    const current=(await openNav(page,testInfo)).locator('[aria-current="page"]');
    if(label)await expect(current,path).toHaveText(label);else await expect(current,path).toHaveCount(0);
  }
});

test('header and footer links resolve to pages in the same language',async({page,request})=>{
  for(const lang of ['en','ko']) {
    await page.goto(localize('/contact/',lang));
    const hrefs=await page.locator('header a[href], footer a[href]').evaluateAll(as=>as.map(a=>a.getAttribute('href')));
    const internal=[...new Set(hrefs.filter(h=>h.startsWith('/')&&!h.startsWith('//')))];
    expect(internal).toEqual(expect.arrayContaining([...navPaths,'/showcase/'].map(p=>localize(p,lang))));
    for(const href of internal) {
      expect(langOf(href),href).toBe(lang);
      expect((await request.get(href)).status(),href).toBe(200);
    }
    await expect(page.locator('header a[aria-label="Induo Works"]')).toHaveAttribute('href',localize('/',lang));
  }
});

test('desktop shows the inline navigation and no menu button',async({page},testInfo)=>{
  test.skip(isMobile(testInfo),'desktop layout');
  await page.goto('/');
  await expect(page.getByRole('navigation',{name:'Primary',exact:true}).getByRole('link')).toHaveText(nav.en);
  await expect(page.locator('#menu-toggle')).toBeHidden();
  await expect(page.locator('#mobile-menu')).toBeHidden();
});

test('mobile menu opens, closes and works from the keyboard',async({page},testInfo)=>{
  test.skip(!isMobile(testInfo),'menu button only exists below the lg breakpoint');
  await page.goto('/ko/work/');
  const toggle=page.getByRole('button',{name:'메뉴 전환'}),menu=page.locator('#mobile-menu');
  await expect(page.locator('#primary-nav')).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-controls','mobile-menu');
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(menu).toBeHidden();
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(menu).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Primary mobile'}).getByRole('link')).toHaveText(nav.ko);
  await expect(menu.getByRole('link',{name:'작업물'})).toHaveAttribute('aria-current','page');
  await expectNoHorizontalOverflow(page);
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await expect(menu).toBeHidden();
  for(let i=0;i<12&&!(await toggle.evaluate(el=>el===document.activeElement));i++)await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('link',{name:'Induohood'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(menu).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  await page.keyboard.press('Enter');
  for(let i=0;i<3;i++)await page.keyboard.press('Tab');
  await expect(menu.getByRole('link',{name:'함께하는 사람들'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/ko\/workers\/$/);
  await expect(page.locator('#mobile-menu')).toBeHidden();
});

test('skip link is the first focus stop and jumps to the main content',async({page})=>{
  await page.goto('/ko/contact/');
  const skip=page.getByRole('link',{name:'본문으로 건너뛰기'});
  await expect(skip).not.toBeInViewport();
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  await expect(page.locator('main#main')).toContainText('문의');
});

test('language switch keeps the equivalent path',async({page})=>{
  await page.goto('/work/rooftop-alien/');
  await page.getByRole('combobox',{name:'Language'}).selectOption({label:'한국어'});
  await expect(page).toHaveURL(/\/ko\/work\/rooftop-alien\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang','ko');
  await expect(page.locator('[data-field="summary"]')).toHaveText(catalog.projects.find(p=>p.slug==='rooftop-alien').summary.ko);
  await page.getByRole('combobox',{name:'언어'}).selectOption({label:'English'});
  await expect(page).toHaveURL(/\/work\/rooftop-alien\/$/);
  await expect(page).not.toHaveURL(/\/ko\//);
  await expect(page.locator('html')).toHaveAttribute('lang','en');
});

test('language switch carries the query string and hash',async({page})=>{
  await page.goto('/work/detail/?id=grench-boss#top');
  await expect(visibleH1(page)).toHaveText('GRENCH BOSS');
  await page.getByRole('combobox',{name:'Language'}).selectOption({label:'한국어'});
  await expect(page).toHaveURL(/\/ko\/work\/detail\/\?id=grench-boss#top$/);
  await expect(page.locator('html')).toHaveAttribute('lang','ko');
  await expect(page.locator('[data-field="summary"]')).toHaveText(catalog.projects.find(p=>p.slug==='grench-boss').summary.ko);
  await page.goto('/no-such-page/');
  await page.getByRole('combobox',{name:'Language'}).selectOption({label:'한국어'});
  await expect(page).toHaveURL(/\/ko\/$/);
  await expect(visibleH1(page)).toHaveText('Induohood');
});

test('theme toggle switches colours and persists across navigation and reloads',async({page})=>{
  const html=page.locator('html'),bg=()=>page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  await page.goto('/work/');
  await expect(html).toHaveAttribute('data-theme','light');
  expect(await bg()).toBe('rgb(250, 239, 229)');
  await expect(page.locator('#icon-sun')).toBeVisible();
  await expect(page.locator('#icon-moon')).toBeHidden();
  await page.getByRole('button',{name:'Toggle color theme'}).click();
  await expect(html).toHaveAttribute('data-theme','dark');
  await expect.poll(bg).toBe('rgb(9, 17, 26)');
  await expect(page.locator('#icon-moon')).toBeVisible();
  await expect(page.locator('#icon-sun')).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('theme'))).toBe('dark');
  await page.getByRole('navigation',{name:'Site information'}).getByRole('link',{name:'Contact'}).click();
  await expect(page).toHaveURL(/\/contact\/$/);
  await expect(html).toHaveAttribute('data-theme','dark');
  expect(await bg()).toBe('rgb(9, 17, 26)');
  await expect(page.locator('#icon-moon')).toBeVisible();
  await page.getByRole('combobox',{name:'Language'}).selectOption({label:'한국어'});
  await expect(page).toHaveURL(/\/ko\/contact\/$/);
  await expect(html).toHaveAttribute('data-theme','dark');
  await page.getByRole('button',{name:'테마 전환'}).click();
  await expect(html).toHaveAttribute('data-theme','light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme','light');
  expect(await bg()).toBe('rgb(250, 239, 229)');
});

test('stored dark theme applies on the home page before it is interactive',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('theme','dark'));
  await page.goto('/ko/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor)).toBe('rgb(9, 17, 26)');
  await expect(page.locator('#icon-moon')).toBeVisible();
  await settle(page);
  await expect(page.locator('#village-canvas')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('content pages adopt the published catalog when the content worker answers',async({page})=>{
  for(const [path,root] of [['/workers/','#workers-content'],['/ko/work/','#work-board'],['/work/yggbound/','#work-detail'],['/','#village-section']]) {
    await page.goto(path);
    await expect(page.locator(root),path).toHaveAttribute('data-content-source','remote');
  }
});

test('generic work detail reports unknown ids instead of showing another work',async({page})=>{
  await page.goto('/work/detail/?id=missing-work');
  await expect(page.getByText('Work not found. Please return to Works.')).toBeVisible();
  await expect(page.locator('#work-detail')).toBeHidden();
  await expect(page.getByText(catalog.projects[0].summary.en)).toBeHidden();
  await page.goto('/ko/work/detail/');
  await expect(page.getByText('작품을 찾을 수 없습니다. Works에서 다시 찾아주세요.')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
});

test('generic work detail for an unknown id does not keep another work\'s title',async({page})=>{
  test.fail(true,'BUG: /work/detail/ keeps the prerendered "Induo Works Site" <title> when the id is unknown');
  await page.goto('/work/detail/?id=missing-work');
  await expect(page.getByText('Work not found. Please return to Works.')).toBeVisible();
  await expect(page).not.toHaveTitle(new RegExp(esc(catalog.projects[0].title.en)),{timeout:2000});
});

test('work detail keeps the site title format after loading content',async({page})=>{
  test.fail(true,'BUG: work-detail.js rewrites document.title as "<title> | Induo Works" instead of "<title> · Induo Works"');
  await page.goto('/work/yggbound/');
  await settle(page);
  await expect(page).toHaveTitle('Yggbound · Induo Works',{timeout:2000});
});

test.describe('with the content worker unreachable',()=>{
  test.use({content:'offline'});
  test('workers page falls back to the embedded profiles',async({page})=>{
    for(const lang of ['en','ko']) {
      await page.goto(localize('/workers/',lang));
      await expect(page.locator('#workers-content')).toHaveAttribute('data-content-source','embedded');
      for(const worker of catalog.workers) {
        const card=page.locator('article#'+worker.id);
        await expect(card.getByRole('heading',{level:2})).toHaveText(worker.name);
        await expect(card).toContainText(worker.description[lang]);
        for(const project of catalog.projects.filter(p=>p.workerIds?.includes(worker.id)))await expect(card.locator(`a[href="${localize('/work/'+project.slug+'/',lang)}"]`)).toContainText(project.title[lang]);
      }
      await expectNoHorizontalOverflow(page);
    }
  });
  test('works board falls back to the embedded entries',async({page})=>{
    await page.goto('/ko/work/');
    await expect(page.locator('#work-board')).toHaveAttribute('data-content-source','embedded');
    const grid=page.locator('#work-grid');
    for(const project of catalog.projects)await expect(grid.getByRole('heading',{level:2,name:project.title.ko,exact:true})).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
  test('static and generic work details render from embedded data',async({page})=>{
    for(const [path,slug,lang] of [['/work/grench-boss/','grench-boss','en'],['/ko/work/detail/?id=rooftop-alien','rooftop-alien','ko']]) {
      const project=catalog.projects.find(p=>p.slug===slug);
      await page.goto(path);
      await expect(page.locator('#work-detail')).toHaveAttribute('data-content-source','embedded');
      await expect(visibleH1(page)).toHaveText(project.title[lang]);
      await expect(page.locator('[data-field="summary"]')).toHaveText(project.summary[lang]);
      await expect(page.locator('[data-field="year"]')).toHaveText(project.year);
      await expect(page.locator('#detail-creators').getByRole('link')).toHaveText(catalog.workers.filter(w=>project.workerIds.includes(w.id)).map(w=>w.name));
      await expectNoHorizontalOverflow(page);
    }
  });
  test('home village still starts from the embedded catalog',async({page})=>{
    await page.goto('/ko/');
    await expect(page.locator('#village-section')).toHaveAttribute('data-content-source','embedded');
    await expect(visibleH1(page)).toHaveText('Induohood');
    await expect(page.locator('#village-canvas')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
