interface LogUpdateParams {
  clearLastLine?: boolean
}

interface LogFunction {
  (...data: any[]): void

  update(params: LogUpdateParams, ...data: any[]): void
  update(...data: any[]): void

  error(...data: any[]): void

  warn(...data: any[]): void
}

export enum Color {
  Black = 30,
  Red = 31,
  Green = 32,
  Yellow = 33,
  Blue = 34,
  Magenta = 35,
  Cyan = 36,
  White = 37,
  Gray = 90,

  End = 39
}

export enum BackgroundColor {
  Black = 40,
  Red = 41,
  Green = 42,
  Yellow = 43,
  Blue = 44,
  Magenta = 45,
  Cyan = 46,
  White = 47,

  End = 49
}

export enum TextStyle {
  Reset = 0,

  Bold = 1,
  BoldEnd = 22,

  Dim = 2,
  DimEnd = 22,

  Italic = 3,
  ItalicEnd = 23,

  Underline = 4,
  UnderlineEnd = 24,

  Inverse = 7,
  InverseEnd = 27,

  Hidden = 8,
  HiddenEnd = 28,

  Strikethrough = 9,
  StrikethroughEnd = 29
}

type AnyColor = Color | BackgroundColor | TextStyle

const isPlainObject = (value: any): value is Record<any, any> => value?.constructor === Object

export class Logger {
  /** Colorize given `data` with given `colors` */
  public static color(text: string, ...colors: AnyColor[]): string {
    const startCodes = colors
    const endCodes = []

    /** Background color */
    if (startCodes.some(value => value >= BackgroundColor.Black && value <= BackgroundColor.White)) {
      endCodes.push(BackgroundColor.End)
    }

    /** Text style */
    if (startCodes.some(value => value >= TextStyle.Bold && value <= TextStyle.Strikethrough)) {
      const codes = startCodes.filter(value => value >= TextStyle.Bold && value <= TextStyle.Strikethrough)
      
      for (const code of codes) {
        endCodes.push(code + 20 + (code === TextStyle.Bold ? 1 : 0))
      }
    }

    /** Basic color */
    if (startCodes.some(value => (value >= Color.Black && value <= Color.White) || value === Color.Gray)) {
      endCodes.push(Color.End)
    }

    let start = startCodes.map(code => `\x1b[${code}m`).join('')
    let end = endCodes.map(code => `\x1b[${code}m`).join('')

    return start + text + end
  }

  /** Update last log line */
  public static updateLog(text: string, params?: LogUpdateParams): void {
    process.stdout.cursorTo(0)

    if (params?.clearLastLine ?? true) {
      process.stdout.moveCursor(0, -1)
    }
  
    process.stdout.write(text + '\n')
  }

  /** Generate current logger prefix */
  public static prefix(name: string, ...colors: AnyColor[]): string {
    return Logger.color(name, ...colors, TextStyle.Bold)
  }

  /** Initialize logger function */
  public static create(name: string, ...colors: AnyColor[]): LogFunction {
    const prefix = Logger.prefix(name, ...colors)

    const fn = (...data: any[]) => console.log(prefix, ...data)

    fn.update = (...data: any[]) => {
      if (isPlainObject(data[0])) {
        const params: LogUpdateParams = data[0]
        const text = `${prefix} ${data.slice(1).map(value => value.toString()).join(' ')}`

        Logger.updateLog(text, params)
      } else {
        const text = `${prefix} ${data.map(value => value.toString()).join(' ')}`
        Logger.updateLog(text)
      }
    }

    fn.error = (...data: any[]) => console.error(prefix, ...data)
    fn.warn = (...data: any[]) => console.warn(prefix, ...data)

    return fn
  }
}
