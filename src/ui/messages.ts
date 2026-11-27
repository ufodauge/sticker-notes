// All user-facing UI text lives here. Edit wording in this file only.
// - Plain strings are used as-is; functions take the dynamic parts (counts, names).
// - "\n" is a line break (the element must be `white-space: pre-line` / `styles.pre`).
// - Not here: SNS names (`core/sns.ts`, brand names), palette names (`core/palette-data.ts`,
//   part of payload v1), the PWA manifest and <title> (`vite.config.ts`, `index.html`).
import type { SurfaceKind } from "../core/surface.ts";
import type { BackupError } from "../core/backup.ts";
import type { MaterialKind } from "../core/material.ts";

export const t = {
  common: {
    close: "閉じる",
    undo: "元に戻す",
    dismiss: "案内を閉じる",
  },

  app: {
    storageUnavailable: "保存領域を開けなかった",
    toolbar: "操作",
    create: { label: "画像からステッカーを作る", tooltip: "作る" },
    newMaterial: "新しい素材が使えるようになった",
    print: "印刷",
    menu: "メニュー",
  },

  album: {
    pageLabel: (n: number) => `${n}`,
    removePage: { label: (n: number) => `${n}ページ目を消す`, tooltip: "空のページを消す" },
    pageJump: "ページへ移る",
    handle: { label: "回転と大きさ(ドラッグ)", tooltip: "回転と大きさ" },
  },

  tutorial: {
    "tutorial.start": {
      title: "シールの交換",
      text: "QR を読んでもらうと届く\nお返しはポケットに",
      go: "閉じる",
    },
    "tutorial.received": {
      title: "お返しの QR",
      text: "相手が読むと\n相手のポケットに届く",
      go: "閉じる",
    },
    done: "できた",
    replay: "チュートリアル",
  },

  desk: { desk: "机" } satisfies Readonly<Record<SurfaceKind, string>>,

  pocket: {
    sample: "見本",
    open: (n: number) => `ポケット(${n}枚)`,
    dialog: "ポケット",
    pick: (who: string) => `${who} を手に取る`,
    inHand: (who: string) => `${who}(ドラッグしてはがす)`,
    stick: "はがしてページに貼る",
    back: "ポケットに戻す",
    made: "自分で作った",
    from: "from",
    // received, naming no one
    friend: "友だちから",
    date: (iso: string) => iso.replaceAll("-", "."),
  },

  back: {
    show: "シールの裏",
    dialog: "シールの裏",
    flip: "ひっくり返す",
    fromPerson: (n: number) => `この人からのシール ${n}枚`,
  },

  people: {
    open: "もらった人",
    dialog: "もらった人",
    none: "まだだれからももらっていない",
    count: (n: number) => `${n}枚`,
    since: (date: string) => `はじめて ${date}`,
  },

  actionBar: {
    showQr: "交換用のQR",
    discard: "捨てる",
  },

  feedback: {
    discarded: "ポイした",
    receivedInvalid: "読み込めないステッカー",
    receivedAdded: (who: string) => `${who} がポケットに入った`,
    receivedDuplicate: "もう持ってる",
    nthPerson: (n: number) => `${n}人目`,
    inviteCreate: "自分のも作る",
    giveBack: "お返しのQR",
  },

  qr: {
    dialog: "交換用のQR",
    // the tutorial's friend, reading the QR
    read: "読み取り",
    // who the QR says it is from (tapped: the SNS can be changed)
    from: (who: string) => `${who} のSNS`,
    giveBackTo: (who: string) => `${who} にお返し`,
    pick: "QRにするステッカー",
    code: (who: string) => `${who} のQRコード`,
    fullscreen: "全画面",
    share: "リンクを共有",
    copy: "リンクをコピー",
    copied: "コピーした",
    copyFailed: "コピーできなかった",
  },

  create: {
    dialog: "ステッカーを作る",
    loadFailed: "この画像は読み込めない",
    preview: "作成中のステッカー",
    exactMatch: "パレットと完全一致",
    saveFailed: "保存できなかった",
    submit: "ポケットに入れる",
    material: "素材",
    materials: {
      matte: "ふつう",
      holo: "キラ",
      puffy: "ぷっくり",
      glitter: "ラメ",
      clear: "クリア",
      foil: "箔",
    } satisfies Readonly<Record<MaterialKind, string>>,
    materialNew: (name: string) => `${name}(新しく使えるようになった)`,
    foilTone: "箔の色",
    palette: "パレット",
    paletteNatural: "自然な色",
    paletteFilter: "フィルター",
    transparent: "透明色",
    transparentNone: "透明なし",
    transparentColor: (hex: string) => `#${hex} を透明に`,
    dither: "網点",
  },

  // the maker's SNS, one for all of one's own stickers (put in each QR)
  sns: {
    field: "SNS",
    kind: "SNSの種類",
    id: "ID",
    invalid: "このSNSのIDにならない",
  },

  // a sticker that names no one
  noName: "シール",

  menu: {
    dialog: "メニュー",
    sound: "音",
    iosInstall: "共有からホーム画面に追加\n追加しないと、しばらく開かないときに消えることがある",
    backup: "バックアップ",
    restore: "復元",
    restoreFailed: "読み込めなかった",
    restored: (stickers: number, skipped: number) =>
      `${stickers}枚を読み込んだ${skipped > 0 ? `\n読めない項目${skipped}件は飛ばした` : ""}`,
    backupError: {
      "not-json": "バックアップのファイルではない",
      "not-backup": "バックアップのファイルではない",
      "newer-version": "新しい版のアプリで作ったファイル\nアプリを更新してから読み込む",
      "too-large": "ファイルが大きすぎる",
    } satisfies Readonly<Record<BackupError, string>>,
    keepData: "自動削除の防止",
    keepUnsupported: "このブラウザは非対応",
    keepFailed: "失敗しました",
    keepAllowInSettings: "ブラウザの設定でこのアプリのデータ保存を許可してください",
    installHint: "ホーム画面に追加すると許可されやすくなります",
    install: "ホーム画面に追加",
    installStepsIos: "Safari の共有ボタン →「ホーム画面に追加」",
    installStepsOther: "ブラウザのメニュー →「アプリをインストール」または「ホーム画面に追加」",
    palettes: "パレット",
    paletteSave: { label: (name: string) => `${name} を保存`, tooltip: "保存" },
    paletteFormat: { png: "PNG(16x1)", gpl: "GIMP パレット(.gpl)" },
  },

  print: {
    dialog: "印刷",
    modeGroup: "印刷のしかた",
    mode: { album: "シール帳", grid: "一覧" },
    cutLine: "カットライン",
    sheet: (n: number) => `印刷シート ${n}`,
    submit: "印刷",
    stickers: "印刷するステッカー",
    fewer: (who: string) => `${who} を減らす`,
    more: (who: string) => `${who} を増やす`,
    count: (who: string) => `${who} の枚数`,
    dotSize: "1ドットの大きさ(mm)",
    dotSummary: (mm: number) => `mm/ドット・約${mm}mm角`,
    qr: {
      own: "自分のQR",
      sticker: "QRにするステッカー",
      size: "QRの大きさ",
      sideMm: (mm: number) => `${mm}mm角`,
      moduleMm: (mm: number) => `${mm.toFixed(2)}mm/モジュール`,
      risky: "・読み取りにくいかも",
    },
  },
} as const;

// The debug menu's words, apart from `t` so that a build without the menu leaves them out too.
export const debugText = {
  open: "デバッグ",
  dialog: "デバッグ",
  unlockAll: "素材をすべて使えるようにする",
  simulate: "交換をためす",
  simulateHint: "知らない誰かのシールが届く",
  off: "デバッグをやめる",
  hour: "時刻",
  hourClock: "端末の時計",
  hourAt: (h: number) => `${h}時`,
  samples: "見本(場面と素材)",
  flows: "流れを見る",
  flowsClose: "流れを閉じる",
  flowsFire: "出来事を起こす",
  flowsLog: "出来事の記録",
  samplesAt: (h: number, m: number) => `${h}:${String(m).padStart(2, "0")}`,
} as const;
