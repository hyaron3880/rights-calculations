// Tax brackets for years 2018-2024
const TAX_BRACKETS = {
    2024: [[84120, 0.1], [120720, 0.14], [193800, 0.2], [269280, 0.31], [560280, 0.35], [721560, 0.47], [Infinity, 0.5]],
    2023: [[81480, 0.1], [116760, 0.14], [187440, 0.2], [260520, 0.31], [542160, 0.35], [698280, 0.47], [Infinity, 0.5]],
    2022: [[77400, 0.1], [110880, 0.14], [178080, 0.2], [247440, 0.31], [514920, 0.35], [663240, 0.47], [Infinity, 0.5]],
    2021: [[75480, 0.1], [108360, 0.14], [173880, 0.2], [241680, 0.31], [502920, 0.35], [647640, 0.47], [Infinity, 0.5]],
    2020: [[75960, 0.1], [108960, 0.14], [174960, 0.2], [243120, 0.31], [505920, 0.35], [651600, 0.47], [Infinity, 0.5]],
    2019: [[75720, 0.1], [108600, 0.14], [174360, 0.2], [242400, 0.31], [504360, 0.35], [649560, 0.47], [Infinity, 0.5]],
    2018: [[74880, 0.1], [107400, 0.14], [172320, 0.2], [239520, 0.31], [498360, 0.35], [641880, 0.47], [Infinity, 0.5]]
};

class RightsCalculator {
    constructor() {
        // 2024 Constants
        this.QUALIFYING_PENSION_CEILING = 9430;  // תקרת קצבה מזכה
        this.BASIC_EXEMPTION_RATE = 0.35;  // פטור בסיסי
        this.ADDITIONAL_EXEMPTION_RATE = 0.17;  // פטור נוסף
        this.TOTAL_EXEMPTION_RATE = 0.52;  // סה"כ פטור
        this.SEVERANCE_IMPACT_FACTOR = 1.35;  // מקדם השפעת פיצויים
        this.MAX_SEVERANCE_IMPACT = 440000;  // תקרת השפעת פיצויים
        this.MONTHS_FACTOR = 180;  // מקדם חודשי
        this.CURRENT_YEAR = 2024;  // שנת מס נוכחית
        
        // Tax credit point value for 2024
        this.CREDIT_POINT_VALUE = 242;  // ערך נקודת זיכוי
        this.MALE_CREDIT_POINTS = 2.25;  // נקודות זיכוי לגבר
        this.FEMALE_CREDIT_POINTS = 2.75;  // נקודות זיכוי לאישה
        
        // National Insurance Constants
        this.NI_THRESHOLD = 7522;  // סף ביטוח לאומי (60% מהשכר הממוצע)
        this.NI_MAX = 49030;  // תקרת ביטוח לאומי
        
        // Insurance rates for 60+
        this.NI_LOW_RATE = 0.004;  // שיעור ביטוח לאומי נמוך
        this.NI_HIGH_RATE = 0.07;  // שיעור ביטוח לאומי גבוה
        this.HEALTH_LOW_RATE = 0.031;  // שיעור ביטוח בריאות נמוך
        this.HEALTH_HIGH_RATE = 0.05;  // שיעור ביטוח בריאות גבוה
    }

    calculateInsurance(monthlyIncome) {
        // Cap the income at maximum
        const income = Math.min(monthlyIncome, this.NI_MAX);
        
        // Calculate for the lower bracket
        const lowerBracket = Math.min(income, this.NI_THRESHOLD);
        const niLow = lowerBracket * this.NI_LOW_RATE;
        const healthLow = lowerBracket * this.HEALTH_LOW_RATE;
        
        // Calculate for the higher bracket if needed
        let niHigh = 0, healthHigh = 0;
        if (income > this.NI_THRESHOLD) {
            const higherAmount = income - this.NI_THRESHOLD;
            niHigh = higherAmount * this.NI_HIGH_RATE;
            healthHigh = higherAmount * this.HEALTH_HIGH_RATE;
        }
        
        return {
            national_insurance: niLow + niHigh,
            health_insurance: healthLow + healthHigh
        };
    }

    calculateTaxBracket(annualIncome) {
        const brackets = TAX_BRACKETS[this.CURRENT_YEAR];
        
        // Find the relevant tax bracket
        for (const [limit, rate] of brackets) {
            if (annualIncome <= limit) {
                return rate * 100;  // Convert to percentage
            }
        }
        
        return brackets[brackets.length - 1][1] * 100;  // Return highest bracket
    }

    calculateNetIncome(monthlyIncome, gender) {
        const annualIncome = monthlyIncome * 12;
        let totalTax = 0;
        let remainingIncome = annualIncome;
        let prevLimit = 0;

        // Calculate income tax
        for (const [limit, rate] of TAX_BRACKETS[this.CURRENT_YEAR]) {
            if (remainingIncome <= 0) break;
            
            const taxableInBracket = Math.min(remainingIncome, limit - prevLimit);
            const taxInBracket = taxableInBracket * rate;
            totalTax += taxInBracket;
            
            remainingIncome -= taxableInBracket;
            prevLimit = limit;
        }

        // Apply tax credit points
        const creditPoints = gender === 'male' ? this.MALE_CREDIT_POINTS : this.FEMALE_CREDIT_POINTS;
        const annualCredit = creditPoints * this.CREDIT_POINT_VALUE * 12;
        totalTax = Math.max(0, totalTax - annualCredit);
        const monthlyTax = totalTax / 12;

        // Calculate insurance
        const insurance = this.calculateInsurance(monthlyIncome);
        
        // Calculate total deductions
        const totalDeductions = monthlyTax + insurance.national_insurance + insurance.health_insurance;
        
        return {
            gross_income: monthlyIncome,
            tax: monthlyTax,
            national_insurance: insurance.national_insurance,
            health_insurance: insurance.health_insurance,
            total_deductions: totalDeductions,
            net_income: monthlyIncome - totalDeductions
        };
    }

    calculateExemption(birthDate, gender, pensionStartDate, exemptSeverance, capitalizationAmount, monthlyPension = null, additionalIncome = 0) {
        try {
            // Convert dates from string to Date objects
            const birthDateObj = new Date(birthDate);
            const pensionStartDateObj = new Date(pensionStartDate);
            const currentDate = new Date();

            // Calculate age
            let age = currentDate.getFullYear() - birthDateObj.getFullYear();
            if (currentDate.getMonth() < birthDateObj.getMonth() || 
                (currentDate.getMonth() === birthDateObj.getMonth() && currentDate.getDate() < birthDateObj.getDate())) {
                age--;
            }

            // Check eligibility age
            const retirementAge = gender.toLowerCase() === 'male' ? 67 : 62;
            let pensionStartAge = pensionStartDateObj.getFullYear() - birthDateObj.getFullYear();
            if (pensionStartDateObj.getMonth() < birthDateObj.getMonth() || 
                (pensionStartDateObj.getMonth() === birthDateObj.getMonth() && pensionStartDateObj.getDate() < birthDateObj.getDate())) {
                pensionStartAge--;
            }
            const eligibilityAge = Math.max(retirementAge, pensionStartAge);

            if (age < eligibilityAge) {
                return {
                    error: `טרם הגעת לגיל הזכאות. גיל הזכאות במקרה שלך הוא ${eligibilityAge}`
                };
            }

            // Calculate total exempt capital ceiling
            const totalExemptCapital = this.QUALIFYING_PENSION_CEILING * this.TOTAL_EXEMPTION_RATE * this.MONTHS_FACTOR;

            // Calculate severance impact (limited to maximum)
            const severanceImpact = Math.min(
                exemptSeverance * this.SEVERANCE_IMPACT_FACTOR,
                this.MAX_SEVERANCE_IMPACT
            );

            // Calculate remaining exempt capital
            const remainingExemptCapital = totalExemptCapital - severanceImpact;

            // Check capitalization amount
            if (capitalizationAmount > remainingExemptCapital) {
                return {
                    error: "סכום ההיוון המבוקש גבוה מיתרת ההון הפטורה"
                };
            }

            // Calculate remaining exempt capital for pension
            const finalExemptCapital = remainingExemptCapital - capitalizationAmount;

            // Calculate monthly exemption amount
            const monthlyExemption = finalExemptCapital / this.MONTHS_FACTOR;

            // Calculate exemption percentage from qualifying pension ceiling
            const exemptionPercentage = (monthlyExemption / this.QUALIFYING_PENSION_CEILING) * 100;

            // Calculate taxable income if monthly pension is provided
            let taxableIncome = null;
            let totalMonthlyIncome = null;
            let marginalTaxRate = null;
            let netIncome = null;

            if (monthlyPension !== null) {
                taxableIncome = Math.max(0, monthlyPension - monthlyExemption);
                totalMonthlyIncome = taxableIncome + parseFloat(additionalIncome || 0);
                
                // Calculate tax details only if there's income
                if (totalMonthlyIncome > 0) {
                    marginalTaxRate = this.calculateTaxBracket(totalMonthlyIncome * 12);
                    netIncome = this.calculateNetIncome(totalMonthlyIncome, gender).net_income;
                }
            }

            return {
                calculations: {
                    total_exempt_capital: totalExemptCapital,
                    severance_impact: severanceImpact,
                    remaining_exempt_capital: remainingExemptCapital,
                    final_exempt_capital: finalExemptCapital,
                    monthly_exemption: monthlyExemption,
                    exemption_percentage: exemptionPercentage,
                    taxable_income: taxableIncome,
                    total_monthly_income: totalMonthlyIncome,
                    marginal_tax_rate: marginalTaxRate,
                    net_income: netIncome,
                    minimum_exemption_rate: this.ADDITIONAL_EXEMPTION_RATE * 100  // 17% minimum
                }
            };

        } catch (e) {
            return { error: e.toString() };
        }
    }
}

// Create a global instance of the calculator
const calculator = new RightsCalculator();

// Handle form submission
document.getElementById('calculatorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.innerHTML;
    submitButton.innerHTML = '<span class="animate-pulse">מחשב...</span>';
    submitButton.disabled = true;
    
    const formData = {
        birth_date: document.getElementById('birthDate').value,
        gender: document.querySelector('input[name="gender"]:checked').value,
        pension_start_date: document.getElementById('pensionStartDate').value,
        exempt_severance: parseFloat(document.getElementById('severanceAmount').value),
        capitalization_amount: parseFloat(document.getElementById('exemptCapital').value),
        monthly_pension: document.getElementById('monthlyPension').value ? parseFloat(document.getElementById('monthlyPension').value) : null,
        additional_income: document.getElementById('additionalIncome').value ? parseFloat(document.getElementById('additionalIncome').value) : 0
    };

    try {
        const result = calculator.calculateExemption(
            formData.birth_date,
            formData.gender,
            formData.pension_start_date,
            formData.exempt_severance,
            formData.capitalization_amount,
            formData.monthly_pension,
            formData.additional_income
        );

        if (result.error) {
            document.getElementById('error').textContent = result.error;
            document.getElementById('error').style.display = 'block';
            document.getElementById('results').style.display = 'none';
            return;
        }

        const results = document.getElementById('results');
        results.style.display = 'block';
        setTimeout(() => results.classList.add('show'), 50);

        const data = result.calculations;
        updateWithAnimation('totalExemptCapital', data.total_exempt_capital);
        updateWithAnimation('severanceImpact', data.severance_impact);
        updateWithAnimation('remainingExemptCapital', data.remaining_exempt_capital);
        updateWithAnimation('finalExemptCapital', data.final_exempt_capital);
        updateWithAnimation('monthlyExemption', data.monthly_exemption);
        updateWithAnimation('exemptionPercentage', Math.round(data.exemption_percentage) + '%');

        const taxableIncomeSection = document.getElementById('taxableIncomeSection');
        if (data.taxable_income !== null) {
            updateWithAnimation('taxableIncome', data.taxable_income);
            updateWithAnimation('totalMonthlyIncome', data.total_monthly_income);
            updateWithAnimation('marginalTaxRate', Math.round(data.marginal_tax_rate) + '%');
            updateWithAnimation('netIncome', Math.round(data.net_income));
            
            // Calculate full tax details
            const taxDetails = calculator.calculateNetIncome(data.total_monthly_income, formData.gender);
            
            // Update tax and insurance values
            if (taxDetails.tax) {
                updateWithAnimation('taxAmount', Math.round(taxDetails.tax));
            }
            if (taxDetails.national_insurance) {
                updateWithAnimation('nationalInsurance', Math.round(taxDetails.national_insurance));
            }
            if (taxDetails.health_insurance) {
                updateWithAnimation('healthInsurance', Math.round(taxDetails.health_insurance));
            }
            if (taxDetails.total_deductions) {
                updateWithAnimation('totalDeductions', Math.round(taxDetails.total_deductions));
            }
            
            taxableIncomeSection.style.display = 'block';
        } else {
            taxableIncomeSection.style.display = 'none';
        }

        document.getElementById('error').style.display = 'none';
    } catch (error) {
        document.getElementById('error').textContent = 'אירעה שגיאה בחישוב. אנא נסה שנית.';
        document.getElementById('error').style.display = 'block';
        document.getElementById('results').style.display = 'none';
    } finally {
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
    }
});
