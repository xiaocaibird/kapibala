# 首轮观测补测候选独立接收

产品源70dd1eeb83e64b72f250a0b83b63c933feaa4b23，执行交付01f2c1a237e84bcff68ade470402b369b345cd58。两者产品树相同，交付增量仅docs；main仍5cc04f7，第二轮未混入。本次只为第一轮观测补证，不替代已签全量/差异报告。

新接线为原预算signal与同GET的source/combined/pending/settled，READ真实PID/start/query/ROLLBACK/release，以及实际Agent保存事务边界。断言来自原要求和最小观察条件；源码只核对事实挂点，不继承开发PASS。实际独立病例从零真实活动与公开消息操作构造，不预置accepted/key，不注入活动量，不自动重试。

旧60cd单次kick证据和原判保持；新增INT-KICK-OBSERVATION-001独立记录CROSS/CANCEL/ACTIVITY。新增INT-READ-CAUSAL-001核实际锁链、读取回滚与恢复保存；另INT-READ-SAVE-ROLLBACK-001以本例真实history UPDATE故障核实际保存回滚。读取与保存各自事务，不能拼成同一事务。严格工具5秒已得违例优先FAIL；新因果通过不将整例升为PASS。预算来源正证与严格60000ms分别判，连续性/真值区间缺证仍BLOCKED。

新增局部observer异常隔离已交付；整个通道仍有旧直接record，未声称所有异常零干扰。若新运行缺事实/截断即缺证，不能依据源码补造。真人、二实例、任意重启强恢复与上线专项不由这三例签通过。第二轮111资产在独立准备分支，仍未执行。

输入版本、原字节Git校验和开发材料身份见reports/followup/20261002-first-round-observation-retest/intake.json。首轮用户全权联调/验收与合理复测授权继续有效，当前研发固定交付后已可协调独立补测，无新增业务选择。
