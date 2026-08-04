\# メタモル - プロジェクト概要



\## 概要

業務リンクランチャーアプリ(アイコングリッド形式で社内の各種Webアプリへのリンクを管理)。

URL: https://kasuyakouta.github.io/metamor/



\## 技術スタック

\- フロント: GitHub Pages上の単一HTMLファイル(2,380行)

\- バックエンド: Google Apps Script (GAS)

\- スプレッドシートID: 1z-vxdy-MafwMPFHSwv\_4zxGUgOAWq3rEQ\_CeQX\_GNOg

\- Service Worker実装済み(sw.js、Cache First戦略でオフライン起動を高速化)



\## このアプリ特有の設計(他アプリと異なる点に注意)

\- \*\*GAS URLは固定値ではない\*\*:デフォルトURL(`DEFAULT\_GAS\_URL`)を持ちつつ、`?gas=`のURLパラメータで上書き可能。設定はSS(設定ストレージ)に保存される

\- 通信はtoken認証付きの通常のfetch方式(`?action=get\&token=...`)

\- 管理者PINはデフォルト値\*\*3150\*\*(他アプリと共通)。SHA系ハッシュ化(`ADMIN\_PIN\_HASH`)して保存、設定画面から変更可能

\- \*\*QRコード読み取り機能あり\*\*(jsQRライブラリを内蔵)。アイコン追加時にQRコードからURLを読み込める

\- Service Workerがscript.google.comへのリクエストのみキャッシュから除外(常にネットワーク優先)



\## 必須ルール(標準スタック)

\- iOS Safari互換性・PWA対応を最優先の設計制約とする

\- 日時はローカル時刻で組み立てる(UTCは使わない)

\- フォントは IBM Plex Sans JP / Noto Sans JP



\## 変更時のお願い

\- 複雑な変更は実装前にオプションA/B形式で提案し、承認を得てから実装する

\- 回答は簡潔に、前置きは省略する

\- 上記の「このアプリ特有の設計」は、明確な指示がない限り変更しないこと

