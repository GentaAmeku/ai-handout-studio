# 強調図

動く例は[decision.json](../examples/decision.json)。判断点を強調した図で判断してもらうときに使う。

visualのtypeをdecisionにし、caption（140字）、steps（2〜6段）、focus（強調する段ID）、任意のtable（2列×1〜4行）を置く。stepsは{id,label,role?}で、label40字、role30字。tableの各セルは80字まで。focusは選択値ではなく説明上の判断点。推奨案の欠点を隠したり、全項目を強調したりしない。

図は初期案を示し、自由回答を編集しても自動で描き替わらない。この区別はcaptionか短い説明で明示する。

生成後は通常表示を実画面で確認する。機械検査だけで、人が経路を読み違えないとは判断しない。

構成や経路の図が要るときは、図を画像にして`visual.type: images`で載せる(SKILL.mdの「図を画像で載せる」)。