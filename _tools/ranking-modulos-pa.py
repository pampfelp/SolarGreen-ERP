#!/usr/bin/env python3
"""Rank public ANEEL PV module records for PA / Equatorial in a date window.

Requires DuckDB and accepts the ANEEL technical and main Parquet files locally.
Exports an audit CSV without personal data. Matching is performed with
CodGeracaoDistribuida = CodEmpreendimento.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path


def normalize(value: str | None) -> str:
    value = unicodedata.normalize("NFKC", value or "")
    value = value.strip().upper()
    return re.sub(r"\s+", " ", value)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--technical", required=True, type=Path)
    parser.add_argument("--main", required=True, type=Path)
    parser.add_argument("--start", type=date.fromisoformat, default=date(2026, 5, 11))
    parser.add_argument("--end", type=date.fromisoformat, default=date(2026, 11, 10))
    parser.add_argument("--as-of", type=date.fromisoformat, default=date(2026, 11, 11))
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--equivalence-output", type=Path)
    args = parser.parse_args()

    try:
        import duckdb
    except ImportError:
        print("Missing dependency. Install DuckDB with: python -m pip install duckdb", file=sys.stderr)
        return 2

    if not args.technical.is_file() or not args.main.is_file():
        parser.error("both local parquet paths must exist")
    if args.start > args.end:
        parser.error("--start must be on or before --end")

    connection = duckdb.connect()
    technical = str(args.technical.resolve()).replace("'", "''")
    main_file = str(args.main.resolve()).replace("'", "''")

    technical_columns = {
        row[0] for row in connection.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{technical}')"
        ).fetchall()
    }
    main_columns = {
        row[0] for row in connection.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{main_file}')"
        ).fetchall()
    }
    required_technical = {
        "CodGeracaoDistribuida", "DatConexao", "NomFabricanteModulo",
        "NomModeloModulo", "QtdModulos",
    }
    required_main = {"CodEmpreendimento", "SigUF", "SigAgente"}
    if not required_technical <= technical_columns or not required_main <= main_columns:
        parser.error("the ANEEL files do not contain the expected fields")

    join_stats = connection.execute(
        f"""
        SELECT count(*) AS technical_rows,
               count(main.CodEmpreendimento) AS matched_rows
        FROM read_parquet('{technical}') AS tech
        LEFT JOIN read_parquet('{main_file}') AS main
          ON tech.CodGeracaoDistribuida = main.CodEmpreendimento
        """
    ).fetchone()
    technical_rows, matched_rows = join_stats
    match_rate = matched_rows / technical_rows if technical_rows else 0.0
    if match_rate < 0.95:
        parser.error(f"join match rate is {match_rate:.2%}, below 95%")

    data = connection.execute(
        f"""
        SELECT tech.DatConexao,
               tech.NomFabricanteModulo,
               tech.NomModeloModulo,
               tech.QtdModulos,
               tech.CodGeracaoDistribuida
        FROM read_parquet('{technical}') AS tech
        INNER JOIN read_parquet('{main_file}') AS main
          ON tech.CodGeracaoDistribuida = main.CodEmpreendimento
        WHERE main.SigUF = 'PA'
          AND main.SigAgente = 'EQUATORIAL PA'
          AND tech.DatConexao BETWEEN ? AND ?
        """,
        [args.start, args.end],
    ).fetchall()

    grouped: dict[tuple[str, str], dict[str, object]] = defaultdict(
        lambda: {
            "modules": 0,
            "plants": set(),
            "original": set(),
            "dates": set(),
        }
    )
    for connected, manufacturer, model, quantity, plant_id in data:
        manufacturer_normalized = normalize(manufacturer)
        model_normalized = normalize(model)
        if not manufacturer_normalized or not model_normalized:
            continue
        row = grouped[(manufacturer_normalized, model_normalized)]
        row["modules"] = int(row["modules"]) + int(quantity or 0)
        row["plants"].add(plant_id)
        row["original"].add((manufacturer or "", model or ""))
        row["dates"].add(connected)

    ranking = sorted(
        grouped.items(),
        key=lambda item: (-int(item[1]["modules"]), item[0][0], item[0][1]),
    )
    total_modules = sum(int(row["modules"]) for _, row in ranking)
    cumulative = 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as output_file:
        writer = csv.writer(output_file)
        writer.writerow([
            "Posição", "Fabricante normalizado", "Modelo normalizado",
            "Fabricante original", "Modelo original", "Módulos",
            "Usinas distintas", "Acumulado de módulos", "Cobertura acumulada",
            "Conexão mínima", "Conexão máxima", "Grafias originais agrupadas",
            "Início da janela solicitada", "Fim da janela solicitada",
            "Data da busca", "Correspondência do vínculo",
        ])
        for rank, ((manufacturer, model), row) in enumerate(ranking, 1):
            cumulative += int(row["modules"])
            originals = sorted(row["original"])
            dates = sorted(row["dates"])
            writer.writerow([
                rank, manufacturer, model,
                " | ".join(sorted({value[0] for value in originals})),
                " | ".join(sorted({value[1] for value in originals})),
                row["modules"], len(row["plants"]), cumulative,
                cumulative / total_modules if total_modules else 0,
                dates[0].isoformat(), dates[-1].isoformat(),
                len(originals), args.start.isoformat(), args.end.isoformat(),
                args.as_of.isoformat(), f"{matched_rows}/{technical_rows} ({match_rate:.2%})",
            ])

    if args.equivalence_output:
        args.equivalence_output.parent.mkdir(parents=True, exist_ok=True)
        pairs = sorted({
            (manufacturer or "", model or "")
            for _, row in grouped.items()
            for manufacturer, model in row["original"]
        })
        with args.equivalence_output.open("w", encoding="utf-8-sig", newline="") as output_file:
            writer = csv.writer(output_file)
            writer.writerow([
                "Fabricante original", "Modelo original",
                "Fabricante normalizado", "Modelo normalizado",
            ])
            writer.writerows([
                [manufacturer, model, normalize(manufacturer), normalize(model)]
                for manufacturer, model in pairs
            ])

    print(f"Ranked {len(ranking)} normalized module models.")
    print(f"Matched technical rows: {matched_rows}/{technical_rows} ({match_rate:.2%}).")
    print(f"Rows in PA / Equatorial / requested window: {len(data)}.")
    print(f"Modules with nonblank manufacturer and model: {total_modules}.")
    if data:
        print(f"Available connection dates in result: {min(row[0] for row in data)} to {max(row[0] for row in data)}.")
    print(f"Output: {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
