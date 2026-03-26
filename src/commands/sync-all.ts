import { BaseCommand } from './base-command';
import { SyncPackagesCommand } from './sync-packages';
import { SyncYoutubeCommand } from './sync-youtube';
import type { CrustCommandContext } from '@crustjs/core';

export class SyncAllCommand extends BaseCommand {
  public name = 'sync:all';
  public description = 'Sync both packages and YouTube videos';

  public override flags = {
    'dry-run': { type: 'boolean', description: 'No files will be written.' },
    'new-only': { type: 'boolean', description: 'Only sync new content.' },
  } as const;

  public async handle(ctx: CrustCommandContext<any, typeof this.flags>) {
    console.log('🚀 Starting full sync...\n');

    const syncPackages = new SyncPackagesCommand();
    const syncYoutube = new SyncYoutubeCommand();

    // We pass the context to the sub-commands' handle methods
    await syncPackages.handle(ctx);
    console.log(''); // New line between commands
    await syncYoutube.handle(ctx);

    console.log('\n✅ Full sync completed.');
  }
}
