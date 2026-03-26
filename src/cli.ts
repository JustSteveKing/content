import { Crust } from "@crustjs/core";
import { autoCompletePlugin, helpPlugin, updateNotifierPlugin, versionPlugin } from "@crustjs/plugins";
import { statsCommand } from "./commands/stats";
import { verifySchemaCommand } from "./commands/verify-schema";
import { syncPackagesCommand } from "./commands/sync-packages";
import { syncYoutubeCommand } from "./commands/sync-youtube";

const main = new Crust("content")
  .meta({ description: "Content CLI for JustSteveKing" })
  .use(versionPlugin("1.0.0"))
  .use(autoCompletePlugin())
  .use(helpPlugin())
  .command("stats", (cmd) => cmd
    .meta({ description: "Show content statistics" })
    .run(statsCommand)
  )
  .command("verify", (cmd) => cmd
    .meta({ description: "Verify frontmatter schema" })
    .run(verifySchemaCommand)
  )
  .command("sync:packages", (cmd) => cmd
    .meta({ description: "Sync packages from Packagist" })
    .run(syncPackagesCommand)
  )
  .command("sync:youtube", (cmd) => cmd
    .meta({ description: "Sync videos from YouTube" })
    .run(syncYoutubeCommand)
  );

await main.execute();
