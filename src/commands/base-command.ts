import { Crust, type FlagsDef, type ArgsDef, type EffectiveFlags } from "@crustjs/core";

export abstract class BaseCommand<
  Inherited extends FlagsDef = {},
  Local extends FlagsDef = {},
  A extends ArgsDef = [],
> {
  public abstract name: string;
  public abstract description: string;

  public flags: Local = {} as Local;
  public args: A = [] as unknown as A;

  public abstract handle(ctx: any): void | Promise<void>;

  public build() {
    return new Crust(this.name)
      .meta({ description: this.description })
      .flags(this.flags as any)
      .args(this.args as any)
      .run(this.handle.bind(this));
  }
}
