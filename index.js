import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
  .scriptName('yarn analytics')
  .recommendCommands()
  .demandCommand(1)
  .command('hello', 'Prints message', () => {
    console.log('world');
  })
  .parse();
