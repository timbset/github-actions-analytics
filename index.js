import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

import { builder as loadBuilder } from './load.js';
import { builder as reportBuilder } from './report.js';

dotenv.config();

const getEnv = (name) => {
  if (process.env[name] == null) {
    throw new Error(`Env ${name} is required`);
  }

  return process.env[name];
};

const normalizeNumber = (value) => {
  return value < 10 ? `0${value}` : `${value}`;
};

const normalizeDate = (date) => {
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
};

const buildCreated = (from, to) => `${normalizeDate(from)}..${normalizeDate(to)}`;

const getRepoDirName = () => `${getEnv('GH_REPO_OWNER')}/${getEnv('GH_REPO_NAME')}`.replace('/', '\u2215');

const addFromAndToOptions = (yargs) => yargs.options({
  from: {
    describe: 'filter start date (format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)',
    default: 'yesterday',
    type: 'string'
  },
  to: {
    describe: 'filter start date (format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)',
    default: 'today',
    type: 'string'
  },
});

yargs(hideBin(process.argv))
  .scriptName('yarn analytics')
  .recommendCommands()
  .demandCommand(1)
  .command(
    'load [name]',
    'loads specified entity',
    loadBuilder
  )
  .command(
    'report [name]',
    'builds a report for specified entity',
    reportBuilder
  )
  .command(
    'jobs failures',
    'Builds a list of failed jobs',
    (yargs) =>
      addFromAndToOptions(yargs)
        .options({
          delimiter: {
            default: ',',
          },
          locale: {
            default: 'en-US',
          },
        }),
    ({ from, to, delimiter, locale }) => {
      const created = buildCreated(from, to);
      const repoDirName = getRepoDirName();
      const dataPath = path.join(fileURLToPath(new URL('.', import.meta.url)), 'data', repoDirName, created);

      const headers = [
        'id',
        'run_id',
        'run_attempt',
        'workflow_name',
        'name',
        'head_branch',
        'conclusion',
        'created_at',
        'html_url',
      ];

      const jobsToBuild = fs.readdirSync(path.join(dataPath, 'jobs'))
        .reduce((acc, name) => {
          const { jobs } = JSON.parse(fs.readFileSync(path.join(dataPath, 'jobs', name)).toString());

          return acc.concat(
            jobs.filter((job) => job.conclusion === 'failure')
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

      fs.writeFileSync(
        path.join(dataPath, 'jobs_failures.csv'),
        [headers.map((header) => header.replaceAll('_', ' ')).join(delimiter)].concat(
          jobsToBuild.map((report) =>
            headers.map((header) =>
              header.endsWith('_at')
                // ? dateFormatter.format(new Date(report[header]))
                ? new Date(report[header]).toISOString().replace(/\..+/, '')
                : typeof report[header] === 'number' && !header.includes('id')
                  ? numberFormatter.format(report[header])
                  : report[header]
            ).join(delimiter)
          )
        ).join('\n')
      );
    }
  )
  .parse();
