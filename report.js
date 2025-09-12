import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

import { getDatesFromRange, normalizeDate, writeCsv, getRepoDirName } from './utils.js';
import { loadJobs } from './load.js';

export async function buildFailuresListFromRange({ from, to, ...options }) {
  const dates = getDatesFromRange({ from, to });

  for (const date of dates) {
    await buildFailuresList({ ...options, date });
  }
}

export async function buildFailuresList({ date, delimiter, locale, withFetch }) {
  const created = normalizeDate(date);
  const repoDirName = getRepoDirName();
  const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, 'daily', created);

  const headers = [
    'created_at',
    'id',
    'run_id',
    'run_attempt',
    'workflow_name',
    'name',
    'head_branch',
    'conclusion',
    'step',
    'html_url',
  ];

  const failuresPath = path.join(dataPath, 'jobs_failures.csv');

  if (fs.existsSync(failuresPath)) {
    return;
  }

  const jobsPath = path.join(dataPath, 'jobs');

  if (!fs.existsSync(jobsPath)) {
    if (withFetch) {
      console.log(`Jobs data for ${date} is absent. Loading...`);
      await loadJobs({ date, withFetch });
    } else {
      throw new Error(`Cannot build jobs failures for ${date}. Load jobs raw data first`);
    }
  }

  const jobsToBuild = fs.readdirSync(jobsPath)
    .reduce((acc, name) => {
      const { jobs } = JSON.parse(fs.readFileSync(path.join(jobsPath, name)).toString());

      return acc.concat(
        jobs.filter((job) => job.conclusion === 'failure' || job.conclusion === 'cancelled')
      );
    }, []);

  const dateFormatter = Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' });
  const numberFormatter = Intl.NumberFormat(locale, { maximumSignificantDigits: 10 });

  if (dateFormatter.format(new Date()).includes(delimiter)) {
    console.warn(`Date formatted with "${locale}" locale contains "${delimiter}" delimiter symbols. Very likely that result CSV will be invalid`);
  }

  if (numberFormatter.format(5.15).includes(delimiter)) {
    console.warn(`Number formatted with "${locale}" locale contains "${delimiter}" delimiter symbols. Very likely that result CSV will be invalid`);
  }

  const bodyRows = jobsToBuild.map((report) =>
    headers.map((header) => {
      if (header.endsWith('_at')) {
        return dateFormatter.format(new Date(report[header]));
      }

      if (header === 'step') {
        return report.steps.findLast(
          (step) => step.conclusion === 'failure' || step.conclusion === 'cancelled'
        )?.name ?? '';
      }

      if (typeof report[header] === 'number' && !header.includes('id')) {
        return numberFormatter.format(report[header]);
      }

      return report[header];
    })
  );

  const headerRows = headers.map((header) => header.replaceAll('_', ' '));

  writeCsv(failuresPath, [headerRows, ...bodyRows]);
}

export function mergeCsvFiles(targetPath, sourcePaths) {
  if (sourcePaths.length === 0) {
    throw new Error('At least 1 source path is required');
  }

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  fs.copyFileSync(sourcePaths[0], targetPath);

  for (let i = 1; i < sourcePaths.length; i++) {
    const sourcePath = sourcePaths[i];

    const targetContent = fs.readFileSync(targetPath).toString();
    const sourceContent = fs.readFileSync(sourcePath).toString();

    const [targetHeader, ...targetBody] = targetContent.split('\n');
    const [sourceHeader, ...sourceBody] = sourceContent.split('\n');

    const targetBodyWithoutEmptyLines = targetBody.filter(Boolean);
    const sourceBodyWithoutEmptyLines = sourceBody.filter(Boolean);

    if (sourceBodyWithoutEmptyLines.length === 0) {
      continue;
    }

    if (targetHeader !== sourceHeader) {
      throw new Error(`Headers are different for ${targetPath} and ${sourcePath}`);
    }

    writeCsv(targetPath, [targetHeader, ...targetBodyWithoutEmptyLines, ...sourceBodyWithoutEmptyLines]);
  }
}
