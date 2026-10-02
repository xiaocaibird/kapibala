/** Independent negative partitions from the published same-origin /media/:id
 * contract and its explicit unsafe-character restriction. No SUT imports or
 * inferred restriction on ordinary Unicode/space/double-encoded characters. */
export function mediaUrlRejectionMatrix(validSource:string):{id:string;url:string;rule:string}[] {
 const source=new URL(validSource);
 if(!/^https?:$/.test(source.protocol)||!/^\/media\/[A-Za-z0-9_-]+$/.test(source.pathname)||source.username||source.password||source.search||source.hash)throw new Error('URL matrix requires one genuinely owned simple source');
 const origin=source.origin,id=source.pathname.slice('/media/'.length),insert=(character:string)=>`${origin}/media/${id.slice(0,1)}${character}${id.slice(1)}`;
 return [
  {id:'foreign-origin',url:'https://qa-foreign.invalid/media/x',rule:'configured Gateway origin only'},
  {id:'foreign-protocol',url:'file:///etc/passwd',rule:'configured Gateway HTTP(S) only'},
  {id:'same-origin-nonmedia-path',url:`${origin}/not-media/${id}`,rule:'Only the path differs; foreign-origin rejection cannot mask this guard'},
  {id:'same-origin-userinfo',url:`${source.protocol}//qa-user:qa-synthetic-pass@${source.host}${source.pathname}`,rule:'Only userinfo differs; same allowed origin and media path'},
  {id:'query',url:`${validSource}?query=1`,rule:'No query'},
  {id:'fragment',url:`${validSource}#fragment`,rule:'No fragment'},
  {id:'raw-dot-segment-original',url:`${validSource}/../escape`,rule:'Original regression retained byte-for-byte; reject raw path traversal before normalization'},
  {id:'raw-backslash-traversal',url:`${validSource}\\..\\${id}`,rule:'Backslashes must not normalize into an allowed source'},
  {id:'raw-tab-inside-id',url:insert('\t'),rule:'Reject raw control character even when URL parsing strips it'},
  {id:'raw-cr-inside-id',url:insert('\r'),rule:'Reject raw control character even when URL parsing strips it'},
  {id:'raw-lf-inside-id',url:insert('\n'),rule:'Reject raw control character even when URL parsing strips it'},
  {id:'leading-cr',url:`\r${validSource}`,rule:'Reject a raw leading control even when URL parsing trims it'},
  {id:'trailing-lf',url:`${validSource}\n`,rule:'Reject a raw trailing control even when URL parsing trims it'},
  {id:'encoded-forward-slash',url:`${validSource}%2Fescape`,rule:'Encoded path separator is not a safe media ID'},
  {id:'encoded-backslash',url:`${validSource}%5Cescape`,rule:'Encoded backslash is not a safe media ID'},
  {id:'encoded-dot-segment',url:`${origin}/media/%2e%2e/media/${id}`,rule:'Encoded traversal must not normalize to a real allowed source'},
  {id:'encoded-nul',url:`${validSource}%00`,rule:'Encoded NUL is an unsafe path character'},
  // A raw NUL is last because an input/storage defect could prevent ingestion
  // of subsequent events. That failure remains evidence, never silently omitted.
  {id:'raw-nul-inside-id',url:insert('\0'),rule:'Reject raw NUL while retaining the independent message text'},
 ];
}
