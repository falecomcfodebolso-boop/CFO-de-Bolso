export const metadata = { title: "Política de Privacidade — CFO de Bolso" };

export default function PrivacidadePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 prose prose-slate">
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-3 not-prose mb-8">
        <strong>Aviso:</strong> este é um modelo genérico gerado para fins de prototipagem. Antes de publicar/operar
        comercialmente este SaaS, faça a revisão por um advogado especializado em proteção de dados (LGPD/GDPR) e
        adapte os textos à sua operação real (dados coletados, finalidades, subprocessadores, jurisdição etc).
      </p>

      <h1>Política de Privacidade</h1>
      <p>Última atualização: [DATA]</p>

      <h2>1. Quem somos</h2>
      <p>
        O CFO de Bolso (&ldquo;nós&rdquo;, &ldquo;plataforma&rdquo;) é um serviço de contabilidade e análise de carteira de investimentos
        oferecido a organizações clientes (&ldquo;você&rdquo;, &ldquo;organização&rdquo;). Esta política descreve como coletamos, usamos e
        protegemos os dados pessoais e financeiros tratados na plataforma.
      </p>

      <h2>2. Dados que coletamos</h2>
      <ul>
        <li><strong>Dados de cadastro:</strong> nome, e-mail e senha (armazenada de forma criptografada pelo provedor de autenticação).</li>
        <li><strong>Dados da organização:</strong> nome, razão social, CNPJ/tax ID, moeda base.</li>
        <li>
          <strong>Dados financeiros e contábeis inseridos por você:</strong> lançamentos contábeis, plano de contas,
          posições de carteira, vencimentos de ativos e histórico de conversas com o assistente de IA (CFO de Bolso).
        </li>
        <li><strong>Dados técnicos:</strong> logs de acesso e auditoria, endereço IP, identificadores de sessão.</li>
      </ul>

      <h2>3. Como usamos os dados</h2>
      <p>
        Usamos os dados exclusivamente para operar a plataforma: autenticar usuários, exibir e processar os dados
        contábeis/financeiros da sua organização, gerar os relatórios e índices solicitados, responder às perguntas
        feitas ao CFO de Bolso e enviar alertas de vencimento configurados por você. Não vendemos dados pessoais ou
        financeiros a terceiros.
      </p>

      <h2>4. Isolamento entre organizações (multi-tenancy)</h2>
      <p>
        A plataforma foi desenhada para que os dados de cada organização cliente fiquem estritamente isolados dos
        dados de outras organizações, por meio de controles de acesso em nível de linha (Row Level Security) impostos
        diretamente no banco de dados — e não apenas na camada de aplicação. Um usuário só acessa dados de
        organizações das quais é membro formalmente convidado.
      </p>

      <h2>5. Assistente de IA (CFO de Bolso)</h2>
      <p>
        As perguntas feitas ao assistente e o contexto financeiro necessário para respondê-las podem ser enviados a um
        provedor de modelos de linguagem (ex: Anthropic) para gerar a resposta. Esse contexto é montado exclusivamente
        a partir dos dados da própria organização do usuário que está perguntando, nunca de outras organizações.
        Consulte a política de privacidade do provedor de IA utilizado para entender como ele trata dados enviados via
        API.
      </p>

      <h2>6. Compartilhamento com terceiros</h2>
      <p>
        Podemos compartilhar dados com prestadores de serviço estritamente necessários à operação (ex: provedor de
        banco de dados/autenticação, provedor de modelos de IA, provedor de notificações push/e-mail), sempre sob
        obrigações contratuais de confidencialidade e segurança.
      </p>

      <h2>7. Retenção e exclusão</h2>
      <p>
        Mantemos os dados enquanto a organização mantiver uma conta ativa na plataforma. Após o encerramento da conta,
        os dados podem ser retidos por um período adicional para cumprimento de obrigações legais/contratuais, sendo
        excluídos ou anonimizados em seguida, mediante solicitação.
      </p>

      <h2>8. Seus direitos</h2>
      <p>
        Você pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados pessoais, conforme a legislação
        aplicável (ex: LGPD no Brasil). Entre em contato pelo canal indicado no rodapé da plataforma.
      </p>

      <h2>9. Segurança</h2>
      <p>
        Adotamos controles técnicos (RLS no banco, criptografia em trânsito, autenticação com senha/hash seguro,
        princípio do menor privilégio nas integrações) e organizacionais para proteger os dados. Nenhum sistema é
        100% livre de risco — em caso de incidente relevante, notificaremos as organizações afetadas conforme exigido
        por lei.
      </p>

      <h2>10. Alterações desta política</h2>
      <p>Podemos atualizar esta política periodicamente. Alterações relevantes serão comunicadas na plataforma.</p>

      <h2>11. Contato</h2>
      <p>Dúvidas sobre privacidade: [e-mail de contato/DPO].</p>
    </div>
  );
}
