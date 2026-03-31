import { Crust } from "@crustjs/core";
import { helpPlugin, autoCompletePlugin, versionPlugin } from "@crustjs/plugins";
import { StatsCommand } from "./commands/stats";
import { VerifySchemaCommand } from "./commands/verify-schema";
import { SyncPackagesCommand } from "./commands/sync-packages";
import { SyncYoutubeCommand } from "./commands/sync-youtube";
import { SyncAllCommand } from "./commands/sync-all";
import { MakeContentCommand } from "./commands/make-content";
import { CheckLinksCommand } from "./commands/check-links";
import { CrossPostDevtoCommand } from "./commands/cross-post-devto";

const main = new Crust("content")
  .meta({ description: "Content CLI for JustSteveKing" })
  .use(versionPlugin("1.0.0"))
  .use(autoCompletePlugin())
  .use(helpPlugin())
  .command(new StatsCommand().build())
  .command(new VerifySchemaCommand().build())
  .command(new SyncPackagesCommand().build())
  .command(new SyncYoutubeCommand().build())
  .command(new SyncAllCommand().build())
  .command(new MakeContentCommand().build())
  .command(new CheckLinksCommand().build())
  .command(new CrossPostDevtoCommand().build());

await main.execute();
