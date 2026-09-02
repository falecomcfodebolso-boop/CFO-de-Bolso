export const metadata = { title: "Termos de Uso — CFO de Bolso" };

export default function TermosPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 prose prose-slate">
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-3 not-prose mb-8">
        <strong>Aviso:</strong> modelo genérico gerado para fins de prototipagem — não constitui aconselhamento
        jurídico. Revise com um advogado antes de operar comercialmente.
      </p>

      <h1>Termos de Uso</h1>
      <p>Última atualização: [DATA]</p>

      <h2>1. Aceitação dos termos</h2>
      <p>
        Ao criar uma conta ou usar o CFO de Bolso (&ldquo;plataforma&rdquo;), você concorda com estes Termos de Uso e com a nossa
        Política de Privacidade. Se você estiver aceitando em nome de uma organização, declara ter poderes para
        vinculá-la a estes termos.
      </p>

      <h2>2. Descrição do serviço</h2>
      <p>
        A plataforma oferece ferramentas de escrituração contábil (plano de contas, diário, razões, balancete),
        análise de carteira de investimentos (índices, concentração, agenda de vencimentos) e um assistente com
        inteligência artificial (&ldquo;CFO de Bolso&rdquo;) que responde perguntas com base nos dados inseridos pela sua própria
        organização.
      </p>

      <h2>3. Não é aconselhamento profissional</h2>
      <p>
        As informações, cálculos, índices e respostas geradas pela plataforma — incluindo as respostas do CFO de
        Bolso — têm caráter informativo e de apoio à gestão. Elas <strong>não substituem</strong> a orientação de um
        contador, advogado tributarista ou consultor financeiro licenciado. Decisões contábeis, fiscais e de
        investimento permanecem de sua exclusiva responsabilidade.
      </p>

      <h2>4. Cadastro e organizações</h2>
      <p>
        Cada organização cadastrada tem seus dados isolados das demais. O usuário que cria uma organização torna-se
        seu &ldquo;owner&rdquo; e pode convidar outros usuários com papéis distintos (admin, contador, visualizador), cada um com
        permissões diferentes de leitura/escrita descritas na plataforma.
      </p>

      <h2>5. Responsabilidades do usuário</h2>
      <ul>
        <li>Manter a confidencialidade de suas credenciais de acesso.</li>
        <li>Garantir a exatidão dos dados financeiros e contábeis inseridos na plataforma.</li>
        <li>Usar a plataforma em conformidade com a legislação aplicável.</li>
        <li>Não tentar acessar dados de organizações das quais não é membro, nem contornar os controles de acesso.</li>
      </ul>

      <h2>6. Disponibilidade e limitação de responsabilidade</h2>
      <p>
        A plataforma é fornecida &ldquo;como está&rdquo; e &ldquo;conforme disponível&rdquo;. Não garantimos operação ininterrupta ou livre de
        erros. Na máxima extensão permitida por lei, não nos responsabilizamos por perdas financeiras decorrentes de
        decisões tomadas com base nas informações ou cálculos gerados pela plataforma, incluindo respostas do CFO de
        Bolso.
      </p>

      <h2>7. Propriedade dos dados</h2>
      <p>
        Os dados inseridos por sua organização continuam sendo de sua propriedade. Você pode solicitar a exportação ou
        exclusão dos seus dados a qualquer momento, conforme descrito na Política de Privacidade.
      </p>

      <h2>8. Cancelamento</h2>
      <p>
        Você pode encerrar sua conta a qualquer momento. Reservamo-nos o direito de suspender contas que violem estes
        termos, mediante aviso prévio quando razoavelmente possível.
      </p>

      <h2>9. Alterações destes termos</h2>
      <p>Podemos atualizar estes termos periodicamente. O uso continuado da plataforma após alterações constitui aceite dos novos termos.</p>

      <h2>10. Lei aplicável</h2>
      <p>Estes termos são regidos pelas leis de [jurisdição a definir], sem prejuízo de normas de proteção ao consumidor/dados aplicáveis.</p>

      <h2>11. Contato</h2>
      <p>Dúvidas sobre estes termos: [e-mail de contato].</p>
    </div>
  );
}
