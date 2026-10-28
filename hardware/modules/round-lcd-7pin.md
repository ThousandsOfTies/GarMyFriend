# 丸型SPI液晶・7ピン・型番不明

手持ち液晶基板の型番・メーカーは不明です。任意の製品型番は付けず、管理上の識別名を `round-lcd-7pin` とします。
GC9A01の初期化命令列で240×240の顔を表示できることを実機で確認しました。搭載コントローラーのIDと電源回路の型番は未同定です。

2026-10-28に確認した端子表記は **RST / CS / DC / SDA / SCL / GND / VCC**。
最初の申告「SCM」はユーザーに確認し、「SDA」へ訂正済みです。BL端子は申告された7ピンに含まれません。

| 液晶端子 | 用途 | Orange Pi Zero 2Wの物理ピン | 信号名 |
| --- | --- | --- | --- |
| RST | リセット | 22 | PI6 |
| CS | チップ選択 | 24 | PH5 / SPI1_CS0 |
| DC | データ／命令切り替え | 18 | PH4 |
| SDA | SPIデータ入力 | 19 | PH7 / SPI1_MOSI |
| SCL | SPIクロック | 23 | PH6 / SPI1_CLK |
| GND | 共通グラウンド | 14 | GND |
| VCC | 電源 | 1 | 3.3V（実機で測定・表示確認済み） |

このSDA/SCLは、CS/DC付き4線SPI液晶という端子構成とGC9A01想定に基づく割り当てです。
SDAはMOSIとして扱い、I²CのSDAへは接続しません。MISOは不要です。

VCCは3.3Vで動作確認済みです。購入ページや基板写真・電源回路が確認できたら定格を追記します。5V対応品とは扱いません。
BL端子がないことからバックライト回路や自動点灯を断定しません。

実機用C++出力は、RSTをGPIOで制御してから共有のGC9A01初期化を実行します。設定は `orangepi-zero2w/gpio.csv`・`spi.csv` で、SPI1 CS0を使います。
2026-10-29にgpiochip1のDC=228・RST=262、SPI1の `/dev/spidev1.0` を実機で照合しました。物理6番GNDの緩み・はんだ不足に対してGNDを14番へ変更し、液晶端子のVCC・RST・DCが3.3Vであることを確認しました。
High固定時に液晶側SCLだけ0Vと分かり、ユーザーが挿し間違いを修正した後、1MHzで顔表示を確認しました。その後、通常速度の16MHzへ戻しました。
16MHzでの継続表示、ノブ回転による表情切り替え、押下によるまばたきまでユーザーが確認済みです。
色順序・画面の向き・実表示速度の詳細な測定は未実施です。
Linuxのデバイス名はカーネルの設定によるため、SoCのSPI1という名前だけで `/dev/spidev1.0` などを決め打ちしません。

参照:

- [Orange Pi公式wiringOPのZero 2W物理ピン対応](https://github.com/orangepi-xunlong/wiringOP/blob/a7921ca2f5c124203be10d3418db70a2e15f3c10/wiringPi/wiringPi.c#L1873)
- [Orange Pi Zero 2Wメーカー作成マニュアル・SPI説明](https://orangepi.net/wp-content/uploads/2023/10/OrangePi_Zero2w_H618_User-Manual_v1.1.pdf)
- [Waveshare GC9A01モジュールのSPI信号説明](https://www.waveshare.com/wiki/1.28inch_LCD_Module)

Waveshare資料はコントローラー／信号の参照です。手持ちの7ピン液晶をWaveshare製品と同定したものではありません。
