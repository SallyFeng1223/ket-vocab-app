-- ============================================================
-- A4 診斷抽樣 80 字 — L0（英→中四選一）題目
-- 分層：Starters 15 / Movers 30 / KET-only 高頻具體 20 / KET-only 低頻抽象 15
-- word_id 用 headword 對照 words 表查出，不需預先知道 UUID
-- ============================================================

insert into items (word_id, skill, prompt, answer, payload, status, qa_checked, content_version)
select w.id, 'L0', w.headword, w.zh, v.payload::jsonb, 'active', false, 1
from words w
join (values
  ('stop', '{"distractors_zh": ["攀岩、攀爬", "拼圖、謎題", "球門；進球"]}'),
  ('paper', '{"distractors_zh": ["蛋", "愛", "踢"]}'),
  ('write', '{"distractors_zh": ["丟", "飛", "讓"]}'),
  ('classmate', '{"distractors_zh": ["流行音樂", "銀、銀色", "課、課程"]}'),
  ('young', '{"distractors_zh": ["安靜的", "金髮的", "清楚的"]}'),
  ('grandpa', '{"distractors_zh": ["曲調", "名人", "麻煩"]}'),
  ('beautiful', '{"distractors_zh": ["更糟的", "成功的", "年輕的"]}'),
  ('guitar', '{"distractors_zh": ["顏色", "電車", "密碼"]}'),
  ('some', '{"distractors_zh": ["每個", "一個", "那些"]}'),
  ('sofa', '{"distractors_zh": ["同事", "襯衫", "果醬"]}'),
  ('pink', '{"distractors_zh": ["受歡迎的", "不尋常的", "你真可憐"]}'),
  ('wear', '{"distractors_zh": ["結束", "嘗試", "完成"]}'),
  ('giraffe', '{"distractors_zh": ["馬鈴薯", "零錢包", "咖啡店"]}'),
  ('come', '{"distractors_zh": ["笑", "飛", "教"]}'),
  ('know', '{"distractors_zh": ["潛水", "停留", "加入"]}'),
  ('always', '{"distractors_zh": ["這裡", "相當", "是的"]}'),
  ('slowly', '{"distractors_zh": ["輕易地", "為什麼", "特別是"]}'),
  ('move', '{"distractors_zh": ["回來", "放鬆", "閱讀"]}'),
  ('after', '{"distractors_zh": ["大約、關於", "可能、大概", "在……上方"]}'),
  ('wind', '{"distractors_zh": ["票", "鳥", "門"]}'),
  ('field', '{"distractors_zh": ["站牌、停止", "攀岩、攀爬", "簡訊；文字"]}'),
  ('rain', '{"distractors_zh": ["踢", "馬", "門"]}'),
  ('terrible', '{"distractors_zh": ["友善的", "有霧的", "大聲的"]}'),
  ('difference', '{"distractors_zh": ["水母", "工作", "桌遊"]}'),
  ('swimming pool', '{"distractors_zh": ["小提琴", "信用卡", "紅綠燈"]}'),
  ('up', '{"distractors_zh": ["穿過", "進入", "自從"]}'),
  ('Friday', '{"distractors_zh": ["救護車", "一點點", "工程師"]}'),
  ('temperature', '{"distractors_zh": ["臥室", "領帶", "刷子"]}'),
  ('sports centre', '{"distractors_zh": ["網際網路", "太陽眼鏡", "銀、銀色"]}'),
  ('seat', '{"distractors_zh": ["訓練", "條紋", "南方"]}'),
  ('below', '{"distractors_zh": ["當然（不）", "在……上方", "在……後面"]}'),
  ('cloudy', '{"distractors_zh": ["苗條的", "漂亮的", "延誤的"]}'),
  ('homework', '{"distractors_zh": ["信封", "翅膀", "耳朵"]}'),
  ('thin', '{"distractors_zh": ["下一個的", "令人興奮的", "感到無聊的"]}'),
  ('coffee', '{"distractors_zh": ["手套", "時間", "背包"]}'),
  ('brilliant', '{"distractors_zh": ["遺失的、不見的", "難過的、不安的", "愉快的、宜人的"]}'),
  ('busy', '{"distractors_zh": ["成功的", "獨自的", "健康的"]}'),
  ('have to', '{"distractors_zh": ["將會", "將要（提議）", "不能、不可以"]}'),
  ('map', '{"distractors_zh": ["毯子", "河流", "商人"]}'),
  ('build', '{"distractors_zh": ["邀請", "嘗試", "修理"]}'),
  ('bus station', '{"distractors_zh": ["牛、母牛", "傢伙、人", "個人電腦"]}'),
  ('city', '{"distractors_zh": ["叉子", "烤箱", "短褲"]}'),
  ('pair', '{"distractors_zh": ["專輯、相簿", "景色、看法", "活動、事件"]}'),
  ('dentist', '{"distractors_zh": ["導遊", "皮夾", "烤肉"]}'),
  ('weather', '{"distractors_zh": ["導遊", "類型", "剪刀"]}'),
  ('foot', '{"distractors_zh": ["腿", "球", "油"]}'),
  ('dish', '{"distractors_zh": ["一組、一套", "一塊、一片", "年級；成績"]}'),
  ('guest-house', '{"distractors_zh": ["明天", "牙痛", "棒球"]}'),
  ('girlfriend', '{"distractors_zh": ["橡皮擦", "滑雪板", "洗衣機"]}'),
  ('refrigerator', '{"distractors_zh": ["鯨魚", "鱷魚", "名人"]}'),
  ('hoodie', '{"distractors_zh": ["自助餐廳", "公車總站", "檸檬汽水"]}'),
  ('lorry', '{"distractors_zh": ["棒球", "七月", "浴缸"]}'),
  ('PC', '{"distractors_zh": ["身分證明", "詳細資料", "網球選手"]}'),
  ('thunderstorm', '{"distractors_zh": ["領帶", "攝影", "親吻"]}'),
  ('tennis player', '{"distractors_zh": ["資訊科技", "頁面、頁", "自助餐廳"]}'),
  ('assistant', '{"distractors_zh": ["訂單、點餐", "點子、想法", "轉角、角落"]}'),
  ('petrol station', '{"distractors_zh": ["出售中", "牛仔褲", "工程師"]}'),
  ('shopper', '{"distractors_zh": ["游泳池", "地下鐵", "清潔工"]}'),
  ('wardrobe', '{"distractors_zh": ["世界", "七月", "溜冰"]}'),
  ('runner', '{"distractors_zh": ["點心", "訪客", "斑馬"]}'),
  ('airport', '{"distractors_zh": ["輪子", "奶油", "吐司"]}'),
  ('movie theater', '{"distractors_zh": ["DVD 播放器", "橡皮擦（美式）", "停車場（美式）"]}'),
  ('television', '{"distractors_zh": ["英鎊", "便士", "咖哩"]}'),
  ('harbour', '{"distractors_zh": ["姓氏", "短褲", "樂團"]}'),
  ('kids', '{"distractors_zh": ["教科書", "垃圾桶", "市中心"]}'),
  ('v', '{"distractors_zh": ["在（時間、地點）", "因為、由於", "從……出來"]}'),
  ('pity', '{"distractors_zh": ["祝福、願望", "樂器；儀器", "滑鼠；老鼠"]}'),
  ('pay', '{"distractors_zh": ["等待", "回來", "記得"]}'),
  ('cost', '{"distractors_zh": ["滑鼠；老鼠", "提供、提議", "運動；練習"]}'),
  ('Mr', '{"distractors_zh": ["帽子（鴨舌帽）", "……太太（稱謂）", "騎腳踏車（運動）"]}'),
  ('immediately', '{"distractors_zh": ["至少", "然後", "通常"]}'),
  ('cooking', '{"distractors_zh": ["耳朵", "信封", "網頁"]}'),
  ('fill', '{"distractors_zh": ["嘗試", "擔心", "攀爬"]}'),
  ('action', '{"distractors_zh": ["可取得的、有空的", "很糟的、可怕的", "可愛的、宜人的"]}'),
  ('available', '{"distractors_zh": ["單一的；單身的", "蒼白的、淺色的", "很棒的、傑出的"]}'),
  ('tidy up', '{"distractors_zh": ["理解", "烘烤", "上傳"]}'),
  ('side', '{"distractors_zh": ["祖父母", "直升機", "信用卡"]}'),
  ('look out', '{"distractors_zh": ["寫下來", "上車", "外出"]}'),
  ('fried', '{"distractors_zh": ["有用的", "無聊的", "便宜的"]}'),
  ('whole', '{"distractors_zh": ["時鐘", "禮物", "客人"]}')
) as v(headword, payload)
on w.headword = v.headword;


-- ============================================================
-- 驗收：應新增 80 筆 L0 診斷題目
-- ============================================================
select count(*) as 診斷題目筆數 from items where skill = 'L0' and qa_checked = false;