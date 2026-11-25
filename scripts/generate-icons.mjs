/**
 * 앱 아이콘 생성기: `node scripts/generate-icons.mjs`
 *
 * 로고 마크(겹친 두 원 = 두 사람, 겹친 부분 = 함께 관리하는 돈)를 SVG 로 그려
 * Playwright 의 Chromium 으로 PNG 를 찍는다. 로고를 바꾸면 src/components/logo.tsx 와 함께 고치고 다시 실행한다.
 *
 * 만드는 파일
 *   src/app/icon.svg                    브라우저 탭 아이콘 (Next 가 <link rel="icon"> 을 붙인다)
 *   src/app/favicon.ico                 /favicon.ico 를 직접 요청하는 브라우저용 (32px PNG 를 담은 ICO)
 *   src/app/apple-icon.png              iOS 홈 화면 (180px, Next 가 <link rel="apple-touch-icon"> 을 붙인다)
 *   public/icons/icon-192.png           매니페스트 (any)
 *   public/icons/icon-512.png           매니페스트 (any)
 *   public/icons/icon-maskable-512.png  매니페스트 (maskable: 가운데 80% 안에 마크가 들어간다)
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// globals.css 다크 테마 토큰을 sRGB hex 로 옮긴 값. 이미지 파일은 CSS 변수를 읽지 못한다.
const TILE = "#15181f"; // 잉크 (라이트 --primary)
const INK = "#f0f2f4"; // 다크 --foreground
const BRAND = "#5fcbac"; // 다크 --brand

/** 로고 마크. 32×32 좌표계. logo.tsx 의 LogoMark 와 같은 도형이다. */
const MARK = [
  `<circle cx="20.5" cy="16" r="8.5" fill="${INK}" fill-opacity="0.38"/>`,
  `<circle cx="11.5" cy="16" r="8.5" fill="${INK}"/>`,
  `<path d="M16 8.789a8.5 8.5 0 0 1 0 14.422 8.5 8.5 0 0 1 0-14.422z" fill="${BRAND}"/>`,
].join("");

/**
 * 타일 아이콘 SVG.
 * @param radius 모서리 반경(64 기준). 0 이면 꽉 찬 정사각형(OS 가 직접 마스크를 씌우는 경우).
 * @param scale  마크 크기(32 좌표계 대비 배율). 64 타일에서 1.4 면 마크 폭이 약 57%.
 */
function tileSvg({ radius, scale }) {
  const offset = Number(((64 - 32 * scale) / 2).toFixed(3));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<rect width="64" height="64" rx="${radius}" fill="${TILE}"/>`,
    `<g transform="translate(${offset} ${offset}) scale(${scale})">${MARK}</g>`,
    `</svg>`,
  ].join("");
}

const rounded = tileSvg({ radius: 14, scale: 1.4 });
const square = tileSvg({ radius: 0, scale: 1.3 });
const maskable = tileSvg({ radius: 0, scale: 1.1 });

/** PNG 한 장을 담은 ICO. 최신 브라우저는 ICO 안의 PNG 를 그대로 읽는다. */
function icoFromPng(png, size) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt8(0, 8); // palette
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  async function render(svg, size) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    return page.screenshot({ type: "png", omitBackground: true });
  }

  async function write(path, data) {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
    console.log(path);
  }

  await write("src/app/icon.svg", `${rounded}\n`);
  await write("src/app/favicon.ico", icoFromPng(await render(rounded, 32), 32));
  await write("src/app/apple-icon.png", await render(square, 180));
  await write("public/icons/icon-192.png", await render(rounded, 192));
  await write("public/icons/icon-512.png", await render(rounded, 512));
  await write("public/icons/icon-maskable-512.png", await render(maskable, 512));
} finally {
  await browser.close();
}
