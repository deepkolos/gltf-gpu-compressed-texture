// 一个简单的string命令解析器

interface Option {
  index: number;
  name: string;
  default: string;
  optional: boolean; // TODO: 感觉有点不好实现, 后面再看看怎么实现
}

interface Action {
  desc: string;
  type: string;
  scheme: string;
  options: Option[];
  callback?: Function;
  longTrigger: string;
  shortTrigger: string;
}

export default class CLI {
  private actions: Action[];
  private isDebug: Boolean = false;

  constructor() {
    this.actions = [];
  }

  private getTriggerAction(args: string[]): Action | null {
    let triggerAction: Action | null = null;

    this.actions.some(action => {
      if (!action.longTrigger && !action.shortTrigger && !triggerAction) {
        triggerAction = action;
      }

      if (
        (action.shortTrigger && args.includes(action.shortTrigger)) ||
        (action.longTrigger && args.includes(action.longTrigger))
      ) {
        triggerAction = action;
        return true;
      }
      return false;
    });

    return triggerAction;
  }

  private getActionOptions(
    action: Action,
    args: string[],
  ): { [key: string]: string } {
    const options: { [key: string]: string } = {};
    const rawOptions = args.filter(arg => !arg.startsWith('-'));

    action.options.forEach(option => {
      if (rawOptions[option.index]) {
        options[option.name] = rawOptions[option.index];
      }
    });
    return options;
  }

  public action<T>(
    scheme: string,
    desc: string,
    type: string = '',
    callback?: (e: T) => Promise<unknown> | void,
  ) {
    const keys = scheme.split(' ').map(i => i.trim());
    if (keys.length) {
      const [shortTrigger, longTrigger, options] = keys.reduce(
        (acc, curr) => {
          if (curr.match(/^-\w+/)) acc[0] = curr;
          else if (curr.match(/^--[\w-]+/)) acc[1] = curr;
          else {
            // 解析options [?name: default]
            const result = curr.match(/\[(\?)?\s*(\w+)(\:\s*([\w"'\s]+))?\]/);
            if (result) {
              acc[2].push({
                index: acc[2].length,
                name: result[2],
                optional: !!result[1],
                default: (result[4] || '')
                  .replace(/^[\'\"]/, '')
                  .replace(/[\'\"]$/, ''),
              });
            } else {
              // throw new Error('cli scheme options 格式有误');
            }
          }
          return acc;
        },
        ['', '', []] as [string, string, Option[]],
      );

      this.actions.push({
        desc,
        type,
        scheme,
        options,
        callback,
        longTrigger,
        shortTrigger,
      });
    }
    //  else {
    //   // 兜底输出
    //   this.actions.push({
    //     desc,
    //     type,
    //     options: [],
    //     callback,
    //     longTrigger: '',
    //     shortTrigger: '',
    //   });
    // }
    return this;
  }

  public help() {
    const group = this.actions.reduce(
      (acc, action) => {
        if (!acc[action.type]) acc[action.type] = [];

        acc[action.type].push(action);

        return acc;
      },
      {} as { [key: string]: Action[] },
    );

    for (let name in group) {
      console.log(`${name ? name + ':' : ''}`);
      const maxStrLen = group[name].reduce((acc, action) => {
        if (action.scheme.length > acc) return action.scheme.length;

        return acc;
      }, -Infinity);
      group[name].forEach(action => {
        const emptySpace = Array(maxStrLen - action.scheme.length).join(' ');
        console.log(`  ${action.scheme} ${emptySpace}\t ${action.desc}`);
      });
      console.log('');
    }
  }

  public debug(on: boolean = true) {
    this.isDebug = on;
    return this;
  }

  public async run(args: string[]) {
    const action = this.getTriggerAction(args);

    if (action && action.callback) {
      const options = this.getActionOptions(action, args);

      // options 提取出来
      await action.callback({ ...options });
    } else {
      console.log('未知命令: ', args.join(' '));
    }
  }
}
