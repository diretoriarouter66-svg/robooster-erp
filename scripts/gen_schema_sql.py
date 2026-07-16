#!/usr/bin/env python3
"""Gera o SQL de criação das tabelas do Postgres a partir dos schemas base44/entities/*.jsonc.

Regras (Fase 2):
- Nomes de campo preservados exatamente como no jsonc.
- id: text primary key (preserva IDs originais do Base44).
- created_date / updated_date: timestamptz. created_by: text.
- Mapeamento de tipos: string->text, number->numeric, integer->bigint,
  boolean->boolean, array/object->jsonb, enum->text.
- Campos com format date/date-time (exceto os padrão) ficam como text (Base44 os
  armazena como string; evita atrito na importação).
- Sem foreign keys rígidas: relações preservadas por ID, import em qualquer ordem.
"""
import json, re, os, sys

ENT_DIR = "/root/robooster-erp/base44/entities"
OUT = "/root/robooster-erp/scripts/schema.sql"

# entidade -> nome de tabela (snake_case plural, alinhado ao domínio)
TABLE_NAMES = {
    "Product": "products",
    "Categoria": "categorias",
    "Contato": "contatos",
    "TipoContato": "tipos_contato",
    "SalesChannel": "sales_channels",
    "ProductPricing": "product_pricing",
    "ConfigTributaria": "config_tributaria",
    "Socio": "socios",
    "ImportOperation": "import_operations",
    "StockMovement": "stock_movements",
    "SaleOrder": "sale_orders",
    "FinancialEntry": "financial_entries",
    "Supplier": "suppliers",
    "Customer": "customers",
    "DRESalvo": "dre_salvos",
    "PurchaseOrder": "purchase_orders",
    "ImportItem": "import_items",
    "ImportProcess": "import_processes",
    "ProductCategory": "product_categories",
    "User": "users",
}

STD_COLS = {"id", "created_date", "updated_date", "created_by"}

def strip_jsonc(txt):
    txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    txt = re.sub(r"(?<!:)//[^\n]*", "", txt)  # // comments (não quebra URLs http://)
    return txt

def pg_type(prop):
    t = prop.get("type")
    if isinstance(t, list):
        t = next((x for x in t if x != "null"), "string")
    if t == "array" or t == "object":
        return "jsonb"
    if t == "boolean":
        return "boolean"
    if t == "integer":
        return "bigint"
    if t == "number":
        return "numeric"
    # string e afins
    return "text"

def ident(name):
    # nomes seguros; todos os campos são [a-z0-9_], mas por segurança usamos aspas
    return '"' + name.replace('"', '') + '"'

def main():
    files = sorted(os.listdir(ENT_DIR))
    out = []
    out.append("-- Robooster ERP — schema gerado a partir de base44/entities/*.jsonc (Fase 2)")
    out.append("-- id text PK | created_date/updated_date timestamptz | created_by text")
    out.append("")
    summary = []
    for f in files:
        if not f.endswith(".jsonc"):
            continue
        entity = f[:-6]
        data = json.loads(strip_jsonc(open(os.path.join(ENT_DIR, f)).read()))
        table = TABLE_NAMES[entity]
        props = data.get("properties", {})
        cols = []
        cols.append("  id text PRIMARY KEY")
        for name, prop in props.items():
            if name in STD_COLS:
                continue
            cols.append(f"  {ident(name)} {pg_type(prop)}")
        # colunas padrão do Base44
        cols.append("  created_date timestamptz")
        cols.append("  updated_date timestamptz")
        cols.append("  created_by text")
        body = ",\n".join(cols)
        out.append(f"-- {entity}  ({len(props)} campos)")
        out.append(f"CREATE TABLE IF NOT EXISTS public.{ident(table)} (\n{body}\n);")
        out.append("")
        summary.append((entity, table, len(props)))
    open(OUT, "w").write("\n".join(out))
    print(f"SQL gerado em {OUT}\n")
    print(f"{'ENTIDADE':<18} {'TABELA':<20} CAMPOS")
    print("-"*48)
    for e, t, n in summary:
        print(f"{e:<18} {t:<20} {n}")
    print(f"\nTotal: {len(summary)} tabelas")

if __name__ == "__main__":
    main()
