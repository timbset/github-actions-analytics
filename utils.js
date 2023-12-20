import { join } from 'path';
import { fileURLToPath, URL } from 'url';
import fs from 'fs';

export const DATA_FOLDER_NAME = 'data';

export function getEnv(name) {
  if (process.env[name] == null) {
    throw new Error(`Env ${name} is required`);
  }

  return process.env[name];
}

export function getRepoDirName() {
  return `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`;
}

export function getRootPath() {
  return fileURLToPath(new URL('.', import.meta.url));
}

export function getDataPath() {
  return join(getRootPath(), DATA_FOLDER_NAME);
}

export function getRepoPath() {
  return join(getDataPath(), getRepoDirName());
}

export function normalizeNumber(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

export function normalizeDate(date) {
  if (date === 'today') {
    const today = new Date();

    return [
      today.getUTCFullYear(),
      normalizeNumber(today.getUTCMonth() + 1),
      today.getUTCDate(),
    ].join('-');
  }

  if (date === 'yesterday') {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    return [
      yesterday.getUTCFullYear(),
      normalizeNumber(yesterday.getUTCMonth() + 1),
      normalizeNumber(yesterday.getUTCDate()),
    ].join('-');
  }

  if (/\d{4}(-\d{2}){2}(T(\d{2}:){2}\d{2}Z)?/.test(date)) {
    return date;
  }

  throw new Error(`Invalid date format for ${date}`);
}

export function getDatesFromRange({ from, to }) {
  const fromDate = new Date(normalizeDate(from));
  const toDate = new Date(normalizeDate(to));
  const days = (toDate.getTime() - fromDate.getTime()) / 1000 / 60 / 60 / 24 + 1;

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(fromDate);
    date.setUTCDate(date.getUTCDate() + i);
    return date.toISOString().split('T')[0];
  });
}

export function getDateRange(days) {
  const to = new Date();
  to.setDate(to.getDate() - 1);
  const from = new Date();
  from.setDate(from.getDate() - days);

  return [
    from.toISOString().split('T')[0],
    to.toISOString().split('T')[0],
  ];
}

function stringifyColumns(columns) {
  if (Array.isArray(columns)) {
    return columns.join(',');
  }

  return columns;
}

function stringifyColumnsWithEscape(columns) {
  if (Array.isArray(columns)) {
    return columns.map((column) => {
      let columnStr = column.toString();
      let result = column;

      let shouldBeEscaped = false;

      if (columnStr.includes('"')) {
        result = result.replaceAll('"', '""');
        shouldBeEscaped = true;
      }

      if (columnStr.includes(',')) {
        shouldBeEscaped = true;
      }

      return shouldBeEscaped ? `"${result}"` : `${result}`;
    }).join(',');
  }

  return columns;
}

export function writeCsv(filePath, rows, { escape = true } = {}) {
  const columnStringifier = escape
    ? stringifyColumnsWithEscape
    : stringifyColumns;

  fs.writeFileSync(filePath, rows.map(columnStringifier).join('\n') + '\n');
}
