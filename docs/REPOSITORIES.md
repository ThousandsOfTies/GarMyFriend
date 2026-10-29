# リポジトリの分担

| リポジトリ | 所有するもの |
| --- | --- |
| [gar-my-friend](https://github.com/ThousandsOfTies/gar-my-friend) | 表情・アニメーション、描画コア、アプリとしてのGPIO入力とSPI出力 |
| [GarMyFriend-OrangePiZero2W](https://github.com/ThousandsOfTies/GarMyFriend-OrangePiZero2W) | Orange Pi Zero 2Wの配線CSV、実機導入、VM構築、WebPanelの部品配置と接続 |
| [gar-tools](https://github.com/ThousandsOfTies/gar-tools) | 汎用GPIO読取、液晶初期化、仮想ドライバ、部品のWeb Components |

共通アプリは小文字のハイフン区切り、機種別Productは `GarMyFriend-機種名` に揃えています。
別の基板へ展開するときは、同じ `gar-my-friend` を取り込む別Productを作成します。

このProductは `sources/gar-my-friend` と `sources/gar-tools` をサブモジュールとして取り込み、
使用するコミットを固定します。共有側を先にコミット・pushし、その後でProduct側の参照を更新します。

```sh
git clone --recurse-submodules https://github.com/ThousandsOfTies/GarMyFriend-OrangePiZero2W.git
```

既存のクローンではoriginを新URLへ変更し、更新後にサブモジュールを再現します。

```sh
git remote set-url origin https://github.com/ThousandsOfTies/GarMyFriend-OrangePiZero2W.git
git pull --ff-only
git submodule sync --recursive
git submodule update --init --recursive
```

アプリはProductが指定する `GAR_HARDWARE_DIR` のCSVを読みます。
`scripts/run-face.cjs` はCSVとバイナリーの場所を渡すだけで、表情の判断は持ちません。
BridgeとWebPanelも引き続き画素とノブの入力信号だけを扱います。
