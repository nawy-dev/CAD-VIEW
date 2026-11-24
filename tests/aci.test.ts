import { describe, expect, it } from 'vitest';
import {
  TRUE_COLOR_FLAG,
  aciToRgb,
  colorToCss,
  isTrueColor,
  trueColorCode,
} from '../src/core/render/aci';

describe('جدول ألوان ACI', () => {
  it('الألوان الأساسية 1–9', () => {
    expect(aciToRgb(1)).toEqual([255, 0, 0]);
    expect(aciToRgb(2)).toEqual([255, 255, 0]);
    expect(aciToRgb(3)).toEqual([0, 255, 0]);
    expect(aciToRgb(4)).toEqual([0, 255, 255]);
    expect(aciToRgb(5)).toEqual([0, 0, 255]);
    expect(aciToRgb(6)).toEqual([255, 0, 255]);
    expect(aciToRgb(8)).toEqual([65, 65, 65]);
    expect(aciToRgb(9)).toEqual([128, 128, 128]);
  });

  it('قيم معروفة من الجدول القياسي', () => {
    expect(aciToRgb(10)).toEqual([255, 0, 0]);
    expect(aciToRgb(11)).toEqual([255, 127, 127]);
    expect(aciToRgb(12)).toEqual([204, 0, 0]);
    expect(aciToRgb(13)).toEqual([204, 102, 102]);
    expect(aciToRgb(14)).toEqual([153, 0, 0]);
    expect(aciToRgb(15)).toEqual([153, 76, 76]);
    expect(aciToRgb(16)).toEqual([127, 0, 0]);
    expect(aciToRgb(18)).toEqual([76, 0, 0]);
    expect(aciToRgb(19)).toEqual([76, 38, 38]);
    expect(aciToRgb(20)).toEqual([255, 63, 0]);
    expect(aciToRgb(21)).toEqual([255, 159, 127]);
    expect(aciToRgb(30)).toEqual([255, 127, 0]);
    expect(aciToRgb(40)).toEqual([255, 191, 0]);
    expect(aciToRgb(50)).toEqual([255, 255, 0]);
    expect(aciToRgb(70)).toEqual([127, 255, 0]);
    expect(aciToRgb(90)).toEqual([0, 255, 0]);
    expect(aciToRgb(130)).toEqual([0, 255, 255]);
    expect(aciToRgb(170)).toEqual([0, 0, 255]);
    expect(aciToRgb(210)).toEqual([255, 0, 255]);
  });

  it('درجات الرمادي 250–255', () => {
    expect(aciToRgb(250)).toEqual([51, 51, 51]);
    expect(aciToRgb(251)).toEqual([91, 91, 91]);
    expect(aciToRgb(255)).toEqual([255, 255, 255]);
  });

  it('كل فهرس من 1 إلى 255 يعطي مكوّنات صالحة', () => {
    for (let i = 1; i <= 255; i++) {
      for (const c of aciToRgb(i)) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('colorToCss', () => {
  it('اللون 7 أبيض على الداكن وأسود على الفاتح', () => {
    expect(colorToCss(7, 'dark')).toBe('rgb(255,255,255)');
    expect(colorToCss(7, 'light')).toBe('rgb(0,0,0)');
  });

  it('اللون الحقيقي', () => {
    const code = trueColorCode(0x336699);
    expect(isTrueColor(code)).toBe(true);
    expect(code).toBe(TRUE_COLOR_FLAG + 0x336699);
    expect(colorToCss(code, 'dark')).toBe('rgb(51,102,153)');
  });

  it('يغمّق الألوان الفاتحة على الخلفية الفاتحة', () => {
    expect(colorToCss(2, 'light')).not.toBe('rgb(255,255,0)');
    expect(colorToCss(2, 'dark')).toBe('rgb(255,255,0)');
  });

  it('يفتّح الألوان الداكنة جدًا على الخلفية الداكنة', () => {
    expect(colorToCss(5, 'dark')).not.toBe('rgb(0,0,255)');
    expect(colorToCss(5, 'light')).toBe('rgb(0,0,255)');
  });

  it('isTrueColor للفهارس العادية', () => {
    expect(isTrueColor(7)).toBe(false);
    expect(isTrueColor(255)).toBe(false);
  });
});
