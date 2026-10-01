# REC-003：数据库故障后的 WS 观察前提校正

初始证据保留在冻结运行 `reports/runs/2026-10-01T06-10-21.458Z-1fdb6180/artifacts/system-recovery--REC-003-d-13086-oduces-inconsistency-notice-system`。本纠错只修改QA开发树，不改冻结报告、产品或原始FAIL。

`server.log`第74行在06:36:31.104Z明确记录eventId=3/message持久化失败；公开API在06:36:32.183Z已经读回`database-outage`且恰好一条。旧错误为15秒后frames仍只有auth。旧脚本使用裸WS，仅保存message，未记录close/error；Playwright的test.trace也没有原生ws的完整帧/关闭记录。因此当前证据不能证明当时连接确已关闭，也不能证明活跃连接漏推通知。

原A2第228行要求事件不能丢且推inconsistency；§2.3第169/171行给出认证、sinceSeq及通知kind/ref/message。原文没有要求数据库故障时一个既有TCP/WS连接永不关闭。缺重连与连接状态取证是QA观察缺口，不能把等待死连接的超时直接判为产品通知丢失；也不能反向宣称通知已经通过。

修正后的REC-003先在健康状态实际接收锚点message，取得完整帧中的seq。数据库恢复时明确记录旧连接是否真正收到peer close，以及QA是否主动关闭以重建观察流；两种原因分开。重连认证只携带所有QA观察流最后实际收到的seq，不采用服务端游标、网关eventId或预设0。重连后继续记录所有认证、帧、close、transport error与protocol error；已收到的无效帧/倒退seq仍FAIL，不能因故障存在而吞掉。

故障消息与后续消息仍检查各一条、无丢失、继续消费；不再让通知缺失提前跳过后续消费断言。通知保存实际kind/ref/message并检查关联本次eventId、msgId或群身份。原文未规定具体kind字符串和ref编码，不从实现推导新枚举；无法关联本次故障时保留BLOCKED及原始通知证据。15秒是有限取证预算；无相关通知或有效重连证明时BLOCKED，不创造新通知SLA。确定的帧协议违约、重复消息仍FAIL。

`ReceiptSocket`新增完整通知字段与单独protocolErrors；已有严格健康消费者不放宽。新增自测只启动QA自己的loopback WS server，证明真实收到seq=41、peer关闭1011、第二次auth携带41、通知42与消息43被采集，以及无seq消息不能冒充可容忍断连。产品需用新QA版本另开运行重测；此准备检查不执行产品。
