import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const dir = process.argv[2], out = process.argv[3];
const TAM = 8192; // bytes do DER reservados
const objs = [
  "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] /SigFlags 3 >> >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Annots [4 0 R] >>",
  "<< /Type /Annot /Subtype /Widget /FT /Sig /T (Assinatura1) /V 5 0 R /Rect [0 0 0 0] /P 3 0 R >>",
  `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached /M (D:20261105100000-03'00') /ByteRange [0 0000000000 0000000000 0000000000] /Contents <${"0".repeat(TAM*2)}> >>`,
];
let pdf = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"; const offs = [];
objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i+1} 0 obj\n${o}\nendobj\n`; });
const xref = pdf.length;
pdf += `xref\n0 ${objs.length+1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10,"0")+" 00000 n \n").join("");
pdf += `trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
let buf = Buffer.from(pdf, "latin1");
const ini = buf.indexOf("/Contents <") + "/Contents ".length; const fim = buf.indexOf(">", ini) + 1;
const br = [0, ini, fim, buf.length - fim];
const brTxt = br.map((n,i)=> i===0? "0" : String(n).padStart(10,"0")).join(" ");
buf = Buffer.from(buf.toString("latin1").replace("0 0000000000 0000000000 0000000000", brTxt), "latin1");
const dados = Buffer.concat([buf.subarray(0, ini), buf.subarray(fim)]);
writeFileSync(`${dir}/dados.bin`, dados);
execFileSync("openssl", ["cms","-sign","-binary","-in",`${dir}/dados.bin`,"-signer",`${dir}/u.crt`,"-inkey",`${dir}/u.key`,"-certfile",`${dir}/ca.crt`,"-outform","DER","-out",`${dir}/sig.der`,"-md","sha256","-nosmimecap"]);
const der = readFileSync(`${dir}/sig.der`);
if (der.length > TAM) throw new Error("grande");
const h = der.toString("hex").padEnd(TAM*2, "0");
buf.write(h, ini + 1, "latin1");
writeFileSync(out, buf);
console.log("ok", buf.length, br);
