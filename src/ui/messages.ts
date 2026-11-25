// All user-facing UI text lives here. Edit wording in this file only.
// - Plain strings are used as-is; functions take the dynamic parts (counts, names).
// - "\n" is a line break (the element must be `white-space: pre-line` / `styles.pre`).
// - Not here: SNS names (`core/sns.ts`, brand names), palette names (`core/palette-data.ts`,
//   part of payload v1), the PWA manifest and <title> (`vite.config.ts`, `index.html`).
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
    create: { label: "画像からステッカーを作る", tooltip: "作る", text: "作る" },
    print: "印刷",
    menu: "メニュー",
    viewJar: "瓶で見る",
    viewAlbum: "シール帳で見る",
    lightsOut: "電気を消す",
  },

  jar: {
    label: "瓶",
    list: "瓶の中のステッカー",
    shake: "振る",
    reset: "瓶を立て直す",
    lid: "ふた",
    tilt: "傾きで動かす",
    sound: "音",
    shuffle: "シャッフル",
    pick: "選ぶ",
  },

  jarPick: {
    dialog: "瓶に入れるステッカー",
    counter: (n: number, max: number) => `${n} / ${max}`,
    apply: "瓶に入れる",
    random: "ランダムに戻す",
  },

  album: {
    createFirst: "画像からステッカーを作る",
    pageLabel: (n: number) => `${n}`,
    removePage: { label: (n: number) => `${n}ページ目を消す`, tooltip: "空のページを消す" },
    addPage: "ページを足す",
    pageJump: "ページへ移る",
    handle: { label: "回転と大きさ(ドラッグ)", tooltip: "回転と大きさ" },
  },

  pocket: {
    open: (n: number) => `ポケット(${n}枚)`,
    dialog: "ポケット",
    pick: (who: string) => `${who} を手に取る`,
    inHand: (who: string) => `${who}(ドラッグしてはがす)`,
    stick: "はがしてページに貼る",
    back: "ポケットに戻す",
    made: "自分で作った",
    from: "from",
    date: (iso: string) => iso.replaceAll("-", "."),
  },

  debug: {
    open: "デバッグ",
    dialog: "デバッグ",
    unlockAll: "素材をすべて使えるようにする",
    off: "デバッグをやめる",
  },

  back: {
    show: "裏を見る",
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
    showQr: "QRを出す",
    discard: "捨てる",
  },

  feedback: {
    discarded: "ポイした",
    receivedInvalid: "読み込めないステッカー",
    receivedAdded: (who: string) => `${who} がポケットに入った`,
    receivedDuplicate: "もう持ってる",
    inviteCreate: "自分のも作る",
  },

  qr: {
    dialog: "交換用のQR",
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
      glow: "蓄光",
    } satisfies Readonly<Record<MaterialKind, string>>,
    materialLocked: (name: string, n: number) => `${name}: あと${n}人と交換すると使える`,
    foilTone: "箔にする色",
    palette: "パレット",
    paletteNatural: "自然な色",
    paletteFilter: "フィルター",
    transparent: "透明にする色",
    transparentNone: "透明なし",
    transparentColor: (hex: string) => `#${hex} を透明に`,
    snsKind: "SNSの種類",
    sns: "SNS",
    snsId: "ID",
    dither: "網点でなめらかに",
  },

  menu: {
    dialog: "メニュー",
    iosInstall: "共有からホーム画面に追加\n追加しないと、しばらく開かないときに消えることがある",
    backup: "バックアップ",
    restore: "読み込む",
    restoreFailed: "読み込めなかった",
    restored: (stickers: number, skipped: number) =>
      `${stickers}枚を読み込んだ${skipped > 0 ? `\n読めない項目${skipped}件は飛ばした` : ""}`,
    backupError: {
      "not-json": "バックアップのファイルではない",
      "not-backup": "バックアップのファイルではない",
      "newer-version": "新しい版のアプリで作ったファイル\nアプリを更新してから読み込む",
      "too-large": "ファイルが大きすぎる",
    } satisfies Readonly<Record<BackupError, string>>,
    keepData: "データを自動削除されないようにする",
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
    mode: { album: "シール帳", grid: "ならべる" },
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
