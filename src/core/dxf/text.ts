/** يفك رموز \U+XXXX المستخدمة في ملفات DXF القديمة للحروف غير اللاتينية (مثل العربية). */
export function decodeUnicodeEscapes(s: string): string {
  if (!s.includes('\\U+') && !s.includes('\\u+')) return s;
  return s.replace(/\\[Uu]\+([0-9A-Fa-f]{4})/g, (_m, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

/** رموز %% الخاصة في TEXT: %%c ⌀ ، %%d ° ، %%p ± ، %%% ، وتجاهل %%u و%%o. */
export function decodeControlCodes(s: string): string {
  if (!s.includes('%%')) return s;
  return s
    .replace(/%%[cC]/g, '⌀')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%%/g, '%')
    .replace(/%%[uUoO]/g, '');
}

/** نص TEXT جاهز للعرض. */
export function cleanPlainText(raw: string): string {
  return decodeControlCodes(decodeUnicodeEscapes(raw));
}

/**
 * ينظّف نص MTEXT: يزيل أكواد التنسيق (الخط، الحجم، اللون...) ويحوّل \P إلى سطر جديد
 * والكسور المكدّسة \S1/2; إلى 1/2.
 */
export function cleanMText(raw: string): string {
  const input = decodeControlCodes(decodeUnicodeEscapes(raw));
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i] as string;
    if (ch === '{' || ch === '}') continue;
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = input[i + 1];
    if (next === undefined) break;
    if (next === 'P') {
      out += '\n';
      i++;
    } else if (next === '\\' || next === '{' || next === '}') {
      out += next;
      i++;
    } else if (next === '~') {
      out += ' ';
      i++;
    } else if ('fFHhCcQqTtWwAaSpX'.includes(next)) {
      // أكواد بمعاملات تنتهي بـ ;
      const end = input.indexOf(';', i);
      if (end === -1) {
        i = input.length;
      } else {
        if (next === 'S') out += input.slice(i + 2, end).replace(/[\^#]/g, '/');
        i = end;
      }
    } else if ('LlOoKk'.includes(next)) {
      i++; // مفاتيح خط سفلي/علوي/يتوسطه خط
    } else {
      i++; // هروب غير معروف: نتجاهله
    }
  }
  return out;
}
