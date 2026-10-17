/** Entire dataset is fictional. Future events are separate from preparation context. */
export const DAY_DATE='2026-10-20',DAY_TIMEZONE='Asia/Shanghai';
export const DAY_PEOPLE=[{id:'hcp-li-ming',name:'李明',hcoId:'hco-hechuan',tenantId:'tenant-demo-01',hospital:'和川医院',department:'心内科'},{id:'hcp-zhao-ning',name:'赵宁',hcoId:'hco-hechuan',tenantId:'tenant-demo-01',hospital:'和川医院',department:'心内科'},{id:'hcp-wang-qing',name:'王青',hcoId:'hco-xincheng',tenantId:'tenant-demo-01',hospital:'新城医院',department:'内科'}];
DAY_PEOPLE.push({id:'hcp-xu-an',name:'徐安',hcoId:'hco-qinghe',tenantId:'tenant-demo-01',hospital:'清河医院',department:'呼吸科'});
DAY_PEOPLE.push({id:'hcp-he-jing',name:'何静',hcoId:'hco-chenan',hospital:'晨安医院',department:'内分泌科',tenantId:'tenant-demo-02'},{id:'hcp-sun-zhuo',name:'孙卓',hcoId:'hco-chenan',hospital:'晨安医院',department:'呼吸科',tenantId:'tenant-demo-02'},{id:'hcp-liang-wen',name:'梁文',hcoId:'hco-yuanning',hospital:'远宁医院',department:'普通内科',tenantId:'tenant-demo-02'});
export const DAY_PRODUCTS=[{id:'product-demo-a',name:'示例药品A'},{id:'product-demo-b',name:'示例药品B'}];
DAY_PRODUCTS.push({id:'product-demo-c',name:'示例药品C'},{id:'product-demo-d',name:'示例药品D'});
export const DAY_TRAINING={id:'internal-training-01',start:'2026-10-22T13:30:00+08:00',end:'2026-10-22T15:00:00+08:00',title:'内部培训',statusSource:'SYNTHETIC_FIXTURE'};
export const DAY_SEEDS=[
{id:'plan-day-01',doctorId:'hcp-li-ming',productId:'product-demo-a',purpose:'首次产品信息沟通：介绍A现有适用信息及研究资料概览',history:'10月9日的约见沟通中，李明同意20日09:30用约10分钟了解A。尚未发生产品沟通；不能推断对方仍未了解。',historyRef:'history-li-1009',start:'2026-10-20T09:30:00+08:00',end:'2026-10-20T09:40:00+08:00',materialId:'A-P01',purposeCode:'PRODUCT_INFORMATION'},
{id:'plan-day-02',doctorId:'hcp-zhao-ning',productId:'product-demo-a',purpose:'回应既往研究资料问题：核对S01出处、人群及主要研究终点位置',history:'赵宁10月8日询问S01对应哪份资料，人群与主要研究终点在哪里核对；10月19日确认20日11:00接待。',historyRef:'history-zhao-1008',start:'2026-10-20T11:00:00+08:00',end:'2026-10-20T11:10:00+08:00',materialId:'D01',purposeCode:'MATERIAL_FOLLOWUP'},
{id:'plan-day-03',doctorId:'hcp-wang-qing',productId:'product-demo-b',purpose:'了解当前信息需求，准备回应示例药品B的资料问题',history:'王青希望下一次了解B现有资料和当前信息需求；10月19日确认20日14:30接待。没有已知处方意向或患者信息。',historyRef:'history-wang-1008',start:'2026-10-20T14:30:00+08:00',end:'2026-10-20T14:40:00+08:00',materialId:'B-P01',purposeCode:'INFORMATION_NEED'}];
export const DAY_NOTES={
changed:'今天9:36到9:42见到了李明医生。原计划介绍A的产品信息和研究资料。李医生说产品介绍已看过，今天先不讲研究，想确认本院药房是否已配备A。我没有得到已配备的确认，也没有展示研究资料。我答应明天12点前核实配备状态后回复。',
none:'见到了李明医生。本次只交流示例药品A的现有信息，未展示研究资料。医生暂无新问题，本人没有约定后续跟进。',
notMet:'14:27到新城医院，王医生临时无法接待，14:40离开；没当面交流，没展示资料，也没约下次时间。',
reschedule:'赵医生通知今天11点不方便，问周四14点可否。我那时有培训，还没同意新时间。'};
export const DAY_OUTLINES={
'A-P01':{id:'A-P01',version:1,title:'A-P01｜示例药品A拜访准备提纲',sections:[{title:'1. 本次计划',text:'先确认李明当前希望了解什么，再按需要介绍A的现有适用信息和研究资料结构。已有约见不代表对方尚不了解，也不要求讲完整套材料。'},{title:'2. 核对可用来源',text:'实际药品信息须核对当前适用说明书与企业有效资料。本演示没有真实药品说明书、适应症、用法用量或疗效数据，不能据此对外介绍药品。'},{title:'3. 交流时的边界',text:'只回应有适用依据且在职责内的问题；无法回答的科学问题按企业医学信息流程处理。此提纲不预知现场问题，不构成医学答复。'}]},
'B-P01':{id:'B-P01',version:1,title:'B-P01｜示例药品B拜访准备提纲',sections:[{title:'1. 本次计划',text:'先了解王青当前对B有什么信息需求，再选择适用资料。先前愿意了解不等于处方意向，也不意味着已有具体临床问题。'},{title:'2. 不跨产品套资料',text:'A的准备资料和使用范围不能用于B。本提纲没有B的临床正文；无适用资料时保留缺口，不能套用另一产品结论。'},{title:'3. 正常的空结果',text:'对方暂无需要、临时无法接待或不约后续，均可如实记录。不为清空计划补写反馈、材料展示或本人承诺。'}]}};

export const B_SEEDS=[{"id": "plan-b-01", "doctorId": "hcp-he-jing", "productId": "product-demo-c", "purpose": "介绍示例药品C现有信息", "history": "合成10月9日约见记录；仅准备，不预设医生已接受内容。", "historyRef": "history-b-01", "start": "2026-10-20T09:00:00+08:00", "end": "2026-10-20T09:10:00+08:00", "materialId": null, "purposeCode": "PRODUCT_INFORMATION"}, {"id": "plan-b-02", "doctorId": "hcp-sun-zhuo", "productId": "product-demo-c", "purpose": "核对上次资料请求的版本范围", "history": "合成约见依据；不造疗效内容。", "historyRef": "history-b-02", "start": "2026-10-20T11:00:00+08:00", "end": "2026-10-20T11:10:00+08:00", "materialId": null, "purposeCode": "MATERIAL_FOLLOWUP"}, {"id": "plan-b-03", "doctorId": "hcp-liang-wen", "productId": "product-demo-d", "purpose": "了解示例药品D信息需求", "history": "仅本人计划，未取得约见确认。", "historyRef": "history-b-03", "start": null, "end": null, "materialId": null, "purposeCode": "INFORMATION_NEED", "unconfirmed": true}];
