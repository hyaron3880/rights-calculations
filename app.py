from flask import Flask, render_template, request, jsonify
from datetime import datetime

app = Flask(__name__)

# Tax brackets for years 2018-2024
TAX_BRACKETS = {
    2024: [[84120, 0.1], [120720, 0.14], [193800, 0.2], [269280, 0.31], [560280, 0.35], [721560, 0.47], [float('inf'), 0.5]],
    2023: [[81480, 0.1], [116760, 0.14], [187440, 0.2], [260520, 0.31], [542160, 0.35], [698280, 0.47], [float('inf'), 0.5]],
    2022: [[77400, 0.1], [110880, 0.14], [178080, 0.2], [247440, 0.31], [514920, 0.35], [663240, 0.47], [float('inf'), 0.5]],
    2021: [[75480, 0.1], [108360, 0.14], [173880, 0.2], [241680, 0.31], [502920, 0.35], [647640, 0.47], [float('inf'), 0.5]],
    2020: [[75960, 0.1], [108960, 0.14], [174960, 0.2], [243120, 0.31], [505920, 0.35], [651600, 0.47], [float('inf'), 0.5]],
    2019: [[75720, 0.1], [108600, 0.14], [174360, 0.2], [242400, 0.31], [504360, 0.35], [649560, 0.47], [float('inf'), 0.5]],
    2018: [[74880, 0.1], [107400, 0.14], [172320, 0.2], [239520, 0.31], [498360, 0.35], [641880, 0.47], [float('inf'), 0.5]]
}

class RightsCalculator:
    def __init__(self):
        # 2024 Constants
        self.QUALIFYING_PENSION_CEILING = 9430  # תקרת קצבה מזכה
        self.BASIC_EXEMPTION_RATE = 0.35  # פטור בסיסי
        self.ADDITIONAL_EXEMPTION_RATE = 0.17  # פטור נוסף
        self.TOTAL_EXEMPTION_RATE = 0.52  # סה"כ פטור
        self.SEVERANCE_IMPACT_FACTOR = 1.35  # מקדם השפעת פיצויים
        self.MAX_SEVERANCE_IMPACT = 440000  # תקרת השפעת פיצויים
        self.MONTHS_FACTOR = 180  # מקדם חודשי
        self.CURRENT_YEAR = 2024  # שנת מס נוכחית
        
        # Tax credit point value for 2024
        self.CREDIT_POINT_VALUE = 242  # ערך נקודת זיכוי
        self.MALE_CREDIT_POINTS = 2.25  # נקודות זיכוי לגבר
        self.FEMALE_CREDIT_POINTS = 2.75  # נקודות זיכוי לאישה
        
        # National Insurance Constants
        self.NI_THRESHOLD = 7522  # סף ביטוח לאומי (60% מהשכר הממוצע)
        self.NI_MAX = 49030  # תקרת ביטוח לאומי
        
        # Insurance rates for 60+
        self.NI_LOW_RATE = 0.004  # שיעור ביטוח לאומי נמוך
        self.NI_HIGH_RATE = 0.07  # שיעור ביטוח לאומי גבוה
        self.HEALTH_LOW_RATE = 0.031  # שיעור ביטוח בריאות נמוך
        self.HEALTH_HIGH_RATE = 0.05  # שיעור ביטוח בריאות גבוה

    def calculate_insurance(self, monthly_income):
        """Calculate National Insurance and Health Insurance."""
        # Cap the income at maximum
        income = min(monthly_income, self.NI_MAX)
        
        # Calculate for the lower bracket
        lower_bracket = min(income, self.NI_THRESHOLD)
        ni_low = lower_bracket * self.NI_LOW_RATE
        health_low = lower_bracket * self.HEALTH_LOW_RATE
        
        # Calculate for the higher bracket if needed
        if income > self.NI_THRESHOLD:
            higher_amount = income - self.NI_THRESHOLD
            ni_high = higher_amount * self.NI_HIGH_RATE
            health_high = higher_amount * self.HEALTH_HIGH_RATE
        else:
            ni_high = health_high = 0
        
        return {
            'national_insurance': ni_low + ni_high,
            'health_insurance': health_low + health_high
        }

    def calculate_tax_bracket(self, annual_income):
        """Calculate tax bracket and marginal tax rate for given annual income."""
        brackets = TAX_BRACKETS[self.CURRENT_YEAR]
        
        # Find the relevant tax bracket
        for limit, rate in brackets:
            if annual_income <= limit:
                return rate * 100  # Convert to percentage
        
        return brackets[-1][1] * 100  # Return highest bracket if income exceeds all brackets

    def calculate_net_income(self, monthly_income, gender):
        """Calculate net income after tax and insurance."""
        annual_income = monthly_income * 12
        total_tax = 0
        remaining_income = annual_income
        prev_limit = 0

        # Calculate income tax
        for limit, rate in TAX_BRACKETS[self.CURRENT_YEAR]:
            if remaining_income <= 0:
                break
            
            taxable_in_bracket = min(remaining_income, limit - prev_limit)
            tax_in_bracket = taxable_in_bracket * rate
            total_tax += tax_in_bracket
            
            remaining_income -= taxable_in_bracket
            prev_limit = limit

        # Apply tax credit points
        credit_points = self.MALE_CREDIT_POINTS if gender == 'male' else self.FEMALE_CREDIT_POINTS
        annual_credit = credit_points * self.CREDIT_POINT_VALUE * 12
        total_tax = max(0, total_tax - annual_credit)
        monthly_tax = total_tax / 12

        # Calculate insurance
        insurance = self.calculate_insurance(monthly_income)
        
        # Calculate total deductions
        total_deductions = monthly_tax + insurance['national_insurance'] + insurance['health_insurance']
        
        return {
            'gross_income': monthly_income,
            'tax': monthly_tax,
            'national_insurance': insurance['national_insurance'],
            'health_insurance': insurance['health_insurance'],
            'total_deductions': total_deductions,
            'net_income': monthly_income - total_deductions
        }

    def calculate_exemption(self, birth_date, gender, pension_start_date, exempt_severance, capitalization_amount, monthly_pension=None, additional_income=0):
        try:
            # Convert dates from string to datetime
            birth_date = datetime.strptime(birth_date, '%Y-%m-%d')
            pension_start_date = datetime.strptime(pension_start_date, '%Y-%m-%d')
            current_date = datetime.now()

            # Calculate age
            age = current_date.year - birth_date.year - ((current_date.month, current_date.day) < (birth_date.month, birth_date.day))

            # Check eligibility age
            retirement_age = 67 if gender.lower() == 'male' else 62  # Using minimum women's retirement age
            pension_start_age = pension_start_date.year - birth_date.year - ((pension_start_date.month, pension_start_date.day) < (birth_date.month, birth_date.day))
            eligibility_age = max(retirement_age, pension_start_age)

            if age < eligibility_age:
                return {
                    "error": f"טרם הגעת לגיל הזכאות. גיל הזכאות במקרה שלך הוא {eligibility_age}"
                }

            # Calculate total exempt capital ceiling
            total_exempt_capital = self.QUALIFYING_PENSION_CEILING * self.TOTAL_EXEMPTION_RATE * self.MONTHS_FACTOR

            # Calculate severance impact (limited to maximum)
            severance_impact = min(
                exempt_severance * self.SEVERANCE_IMPACT_FACTOR,
                self.MAX_SEVERANCE_IMPACT
            )

            # Calculate remaining exempt capital
            remaining_exempt_capital = total_exempt_capital - severance_impact

            # Subtract requested capitalization
            if capitalization_amount > remaining_exempt_capital:
                return {
                    "error": "סכום ההיוון המבוקש גבוה מיתרת ההון הפטורה"
                }

            # Calculate remaining exempt capital for pension
            final_exempt_capital = remaining_exempt_capital - capitalization_amount

            # Calculate monthly exemption amount
            monthly_exemption = final_exempt_capital / self.MONTHS_FACTOR

            # Calculate exemption percentage from qualifying pension ceiling
            exemption_percentage = (monthly_exemption / self.QUALIFYING_PENSION_CEILING) * 100

            # Calculate taxable income if monthly pension is provided
            taxable_income = None
            total_monthly_income = None
            marginal_tax_rate = None
            net_income = None

            if monthly_pension is not None:
                taxable_income = max(0, monthly_pension - monthly_exemption)
                total_monthly_income = taxable_income + float(additional_income or 0)
                
                # Calculate tax details only if there's income
                if total_monthly_income > 0:
                    marginal_tax_rate = self.calculate_tax_bracket(total_monthly_income * 12)
                    net_income = self.calculate_net_income(total_monthly_income, gender)['net_income']

            return {
                "calculations": {
                    "total_exempt_capital": total_exempt_capital,
                    "severance_impact": severance_impact,
                    "remaining_exempt_capital": remaining_exempt_capital,
                    "final_exempt_capital": final_exempt_capital,
                    "monthly_exemption": monthly_exemption,
                    "exemption_percentage": exemption_percentage,
                    "taxable_income": taxable_income,
                    "total_monthly_income": total_monthly_income,
                    "marginal_tax_rate": marginal_tax_rate,
                    "net_income": net_income,
                    "minimum_exemption_rate": self.ADDITIONAL_EXEMPTION_RATE * 100  # 17% minimum
                }
            }

        except Exception as e:
            return {"error": str(e)}

calculator = RightsCalculator()

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()
        result = calculator.calculate_exemption(
            data['birth_date'],
            data['gender'],
            data['pension_start_date'],
            float(data['exempt_severance']),
            float(data['capitalization_amount']),
            float(data['monthly_pension']) if data['monthly_pension'] else None,
            float(data['additional_income']) if data.get('additional_income') else 0
        )
        
        # If we have income, calculate net income and tax details
        total_monthly_income = (result['calculations'].get('monthly_pension', 0) or 0) + float(data.get('additional_income', 0))
        if total_monthly_income > 0:
            net_calc = calculator.calculate_net_income(total_monthly_income, data['gender'])
            result['calculations'].update({
                'total_monthly_income': total_monthly_income,
                'marginal_tax_rate': calculator.calculate_tax_bracket(total_monthly_income * 12),
                'net_income': net_calc['net_income'],
                'tax_amount': net_calc['tax'],
                'national_insurance': net_calc['national_insurance'],
                'health_insurance': net_calc['health_insurance'],
                'total_deductions': net_calc['total_deductions']
            })
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8083, debug=True)
