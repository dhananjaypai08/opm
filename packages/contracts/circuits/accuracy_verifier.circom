pragma circom 2.1.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/poseidon.circom";

/**
 * AccuracyVerifier circuit for OPM agent registration.
 *
 * Proves that a candidate agent achieved 100% accuracy on a
 * benchmark suite without revealing the individual test results
 * or the expected outputs.
 *
 * Private inputs:
 *   - expected[N]: expected risk level ordinals (0=LOW, 1=MEDIUM, 2=HIGH, 3=CRITICAL)
 *   - actual[N]:   actual risk level ordinals from the candidate agent
 *   - salt:        random blinding factor for the commitment
 *
 * Public inputs:
 *   - commitmentHash: Poseidon hash of (salt, expected[0..N-1])
 *
 * Public outputs:
 *   - passed: 1 if all expected[i] == actual[i], 0 otherwise
 *   - proofHash: Poseidon hash binding the result to the commitment
 *
 * Compilation:
 *   circom accuracy_verifier.circom --r1cs --wasm --sym -o build/
 *
 * Trusted setup:
 *   snarkjs groth16 setup build/accuracy_verifier.r1cs pot12_final.ptau build/accuracy_verifier_0000.zkey
 *   snarkjs zkey contribute build/accuracy_verifier_0000.zkey build/accuracy_verifier_final.zkey --name="opm-ceremony"
 *   snarkjs zkey export verificationkey build/accuracy_verifier_final.zkey build/verification_key.json
 *
 * Prove:
 *   snarkjs groth16 prove build/accuracy_verifier_final.zkey build/accuracy_verifier_js/accuracy_verifier.wasm input.json build/proof.json build/public.json
 *
 * Verify:
 *   snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json
 *
 * Export Solidity verifier:
 *   snarkjs zkey export solidityverifier build/accuracy_verifier_final.zkey contracts/AccuracyVerifier.sol
 */

template AccuracyVerifier(N) {
    // Private inputs
    signal input expected[N];
    signal input actual[N];
    signal input salt;

    // Public inputs
    signal input commitmentHash;

    // Public outputs
    signal output passed;
    signal output proofHash;

    // Step 1: Verify commitment — hash(salt, expected[0..N-1]) must equal commitmentHash
    // We chain Poseidon hashes since Poseidon has a limited arity
    component commitHashers[N];
    signal commitChain[N + 1];
    commitChain[0] <== salt;

    for (var i = 0; i < N; i++) {
        commitHashers[i] = Poseidon(2);
        commitHashers[i].inputs[0] <== commitChain[i];
        commitHashers[i].inputs[1] <== expected[i];
        commitChain[i + 1] <== commitHashers[i].out;
    }

    // Verify the commitment matches
    commitChain[N] === commitmentHash;

    // Step 2: Check equality for each test case
    component isEq[N];
    signal matchBits[N];

    for (var i = 0; i < N; i++) {
        isEq[i] = IsEqual();
        isEq[i].in[0] <== expected[i];
        isEq[i].in[1] <== actual[i];
        matchBits[i] <== isEq[i].out;  // 1 if match, 0 if mismatch
    }

    // Step 3: Compute product of all match bits (1 iff all match)
    signal product[N];
    product[0] <== matchBits[0];
    for (var i = 1; i < N; i++) {
        product[i] <== product[i - 1] * matchBits[i];
    }

    passed <== product[N - 1];

    // Step 4: Compute proof hash binding result to commitment
    component proofHasher = Poseidon(3);
    proofHasher.inputs[0] <== commitmentHash;
    proofHasher.inputs[1] <== passed;
    proofHasher.inputs[2] <== salt;
    proofHash <== proofHasher.out;
}

// Instantiate with 10 benchmark test cases
component main { public [commitmentHash] } = AccuracyVerifier(10);
