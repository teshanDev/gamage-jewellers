import mongoose from "mongoose";

const calculatorEntrySchema = new mongoose.Schema(
  {
    calculatorType: {
      type: String,
      enum: ['wastage_percentage', 'cost'],
      required: true
    },
    // Common inputs
    pricePerGram22k: { type: Number, required: true }, // Price of 1g of 22K gold in Rs

    // Wastage percentage calculator inputs
    cost: { type: Number }, // Cost in Rs (for wastage percentage calc)
    initialWeight: { type: Number }, // Initial weight in g (22K)

    // Cost calculator inputs
    percentage: { type: Number }, // Wastage percentage (for cost calc)

    // Computed outputs (stored for history)
    computedPercentage: { type: Number }, // For wastage percentage calc
    computedWastageG: { type: Number }, // Wastage in g
    computedFinalWeight24kG: { type: Number }, // Final weight in g (24K)
    computedCost: { type: Number }, // Cost in Rs (for cost calc)

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model("CalculatorEntry", calculatorEntrySchema);
