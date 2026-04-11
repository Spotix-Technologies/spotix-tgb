import { registerStartCommand } from './commands/start';
import { registerConnectCommand } from './commands/connect';
import { registerHelpCommand } from './commands/help';
import { registerStatusCommand } from './commands/status';
import { registerWithdrawCommand } from './commands/withdraw';
import { registerDisconnectCommand } from './commands/disconnect';
import { registerReportCommand } from './commands/report';

export function registerAllCommands() {
  registerStartCommand();
  registerConnectCommand();
  registerHelpCommand();
  registerStatusCommand();
  registerWithdrawCommand();
  registerDisconnectCommand();
  // Report must be registered last — its text middleware is a catch-all
  // for users in report mode. Registering it last ensures all other
  // command handlers get first pick on normal messages.
  registerReportCommand();
}
