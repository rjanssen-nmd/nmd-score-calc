// nmd-score-calc bundle entry point.
//
// All MPG *maths* is imported straight from nmd_bpm_backend's calculation
// modules so it can never drift from the source app:
//
//   * computeReplacementFactors  -> f_i / f_r (breukenmethode, 999-conventie)
//   * buildScaledProductMatrix   -> per-profiel schaling, aantal, categorie-3 opslag
//   * buildMPGKern               -> de MPG-kernmatrix (o.a. f_r -> module B4)
//   * getWeights / applyWeights  -> weegset-weging
//   * matMul / matSum            -> matrixrekenwerk
//
// Only the thin orchestration loop below lives here, and only because the
// Python bridge needs two outputs that upstream `calculateMPG` keeps as
// function-locals:
//
//   * result.mkiUnweightedMatrix        - de gesommeerde indicator x 13-module
//                                         matrix vóór weegset-weging
//   * result.productRows[i].rawMatrix   - de post-kernel productmatrix van elk
//                                         product vóór de `* weights[i].weight` stap
//
// Keeping the loop here also keeps `calculateMPG` synchronous: upstream
// declares it `async`, which the py_mini_racer eval bridge cannot await.
// The loop mirrors nmd_bpm_backend/html/js/calculation/mpgCalculator.js
// (default "MPG" scoreType path) 1:1.

import { zeros, matMul, matSum as matrixSum } from '../../nmd_bpm_backend/html/js/calculation/matrix.js';
import { buildMPGKern } from '../../nmd_bpm_backend/html/js/calculation/kernels.js';
import { STAGES } from '../../nmd_bpm_backend/html/js/calculation/stages.js';
import {
  getWeights,
  applyWeights,
  computeReplacementFactors,
  buildScaledProductMatrix,
} from '../../nmd_bpm_backend/html/js/calculation/productContribution.js';
import {
  startTrace,
  finishTrace,
  traceProduct,
  traceMatrix,
  addWarning,
  addError,
} from '../../nmd_bpm_backend/html/js/calculation/traceLogger.js';

export * from '../../nmd_bpm_backend/html/js/calculation/kernels.js';
export * from '../../nmd_bpm_backend/html/js/calculation/scaling.js';
export { getWeights, applyWeights, computeReplacementFactors, buildScaledProductMatrix } from '../../nmd_bpm_backend/html/js/calculation/productContribution.js';
export { reconcileScaling } from '../../nmd_bpm_backend/html/js/producten/schalingImport.js';

export function calculateMPG({ project, producten, assessmentStrategy, impactIndicators }) {
  startTrace();

  try {
    const result = {
      mki: 0,
      mpg: 0,
      warnings: [],
      productRows: [],
      mkiMatrix: [],
      mkiUnweightedMatrix: [],
      mpgMatrix: [],
      impactTable: [],
      impactLabels: [],
      impactIds: [],
    };

    const levensduur = Number(project.levensduur) || 75;
    const bvo = Number(project.bvo) || 0;
    const denominator = bvo > 0 && levensduur > 0 ? bvo * levensduur : null;
    const weights = getWeights(assessmentStrategy, impactIndicators);
    const impactCount = weights.length;
    let mkiUnweighted = zeros(impactCount, STAGES.length);
    let includedProducts = 0;

    for (const product of producten) {
      if (!product.nmd_id) {
        const warning = 'Product zonder NMD-id overgeslagen';
        result.warnings.push(warning);
        addWarning(warning);
        continue;
      }

      const declaration = product._declaration;
      const registration = product._registration;
      const valid = product._declarationValid;

      if (!declaration) {
        const warning = `Geen milieuverklaring gevonden voor ${product.nmd_id}`;
        result.warnings.push(warning);
        addWarning(warning);
        continue;
      }

      if (!valid) {
        const peildatumHandhaven = project.peildatumHandhaven !== false;
        const warning = `Geen geldige verklaring op de peildatum voor ${product.nmd_id} — dichtstbijzijnde verklaring gebruikt` + (peildatumHandhaven ? ' (product overgeslagen, Peildatum handhaven is actief)' : ' (product toch meegenomen, Peildatum handhaven staat uit)');
        result.warnings.push(warning);
        addWarning(warning);
        if (peildatumHandhaven) {
          continue;
        }
      }

      traceProduct(product.nmd_id, 'Milieuverklaring geselecteerd', declaration.construction_product?.title || 'Onbekend product');
      const contribution = calculateProductContribution({ product, registration, declaration, weights, levensduur, assessmentStrategy, denominator });
      traceMatrix('calculation', 'Productmatrix', contribution.matrix, product.nmd_id);
      contribution.warnings.forEach((warning) => result.warnings.push(warning));

      for (let i = 0; i < impactCount; i++) {
        for (let j = 0; j < STAGES.length; j++) {
          mkiUnweighted[i][j] += contribution.matrix[i][j];
        }
      }

      result.productRows.push(contribution.summary);
      includedProducts++;
    }

    traceMatrix('aggregate', 'Ongewogen MKI-matrix', mkiUnweighted);
    result.mkiUnweightedMatrix = mkiUnweighted;
    const mkiMatrix = applyWeights(mkiUnweighted, weights);
    traceMatrix('aggregate', 'Gewogen MKI-matrix', mkiMatrix);
    result.mkiMatrix = mkiMatrix;
    result.mki = matrixSum(mkiMatrix);

    if (denominator) {
      result.mpgMatrix = mkiMatrix.map((row) => row.map((value) => value / denominator));
      traceMatrix('aggregate', 'MPG-matrix', result.mpgMatrix);
      result.mpg = matrixSum(result.mpgMatrix);
    } else {
      const warning = 'BVO ontbreekt of is 0. MPG kan niet worden berekend.';
      result.warnings.push(warning);
      addWarning(warning);
    }

    result.impactTable = buildImpactTable(mkiMatrix, result.mpgMatrix.length > 0 ? result.mpgMatrix : null, weights);
    result.impactLabels = weights.map((weight) => weight.title);
    result.impactIds = weights.map((weight) => weight.id);
    result.includedProducts = includedProducts;
    result.totalProducts = producten.length;

    finishTrace({ mki: result.mki, mpg: result.mpg, products: includedProducts });
    return result;
  } catch (error) {
    addError('MPG-berekening mislukt', error);
    throw error;
  }
}

function calculateProductContribution({ product, registration, declaration, weights, levensduur, assessmentStrategy, denominator }) {
  const impactCount = weights.length;

  const { f_i, f_r, lifespan } = computeReplacementFactors({ declaration, levensduur });

  const { scaled, matchedProfile, warnings, aantal } = buildScaledProductMatrix({
    product,
    declaration,
    assessmentStrategy,
    registration,
    impactCount,
    STAGES,
  });

  const kernel = buildMPGKern(f_i, f_r, product.onv_herg ? 'Ja' : 'Nee', STAGES);
  const finalMatrix = matMul(scaled, kernel);
  const weightedMatrix = finalMatrix.map((row, i) => row.map((value) => value * weights[i].weight));
  const contribution = matrixSum(weightedMatrix);
  const mpgContribution = denominator ? contribution / denominator : null;

  return {
    matrix: finalMatrix,
    summary: {
      nmd_id: product.nmd_id,
      title: declaration.construction_product?.title || '',
      lifespan,
      aantal,
      f_i,
      f_r,
      contribution,
      mpg_contribution: mpgContribution,
      unresolved: !matchedProfile,
      matrix: weightedMatrix,
      rawMatrix: finalMatrix,
    },
    warnings,
  };
}

function buildImpactTable(mki, mpg, weights) {
  return weights.map((ic, index) => ({
    title: ic.title,
    weight: ic.weight,
    mki: mki[index].reduce((a, b) => a + b, 0),
    mpg: mpg ? mpg[index].reduce((a, b) => a + b, 0) : null,
  }));
}
